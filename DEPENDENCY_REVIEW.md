# Dependency Review & Bug Analysis

## Critical Issues Found

### 1. **Toggle Unreliable - `handleToggle` Dependencies** (Line 1588)
**Problem**: `handleToggle` dependency array includes many state values that change frequently, causing the callback to be recreated constantly. This creates race conditions where:
- The callback captures stale `isOn` state
- Multiple rapid clicks can queue conflicting commands
- The HA service call may use outdated state

**Current deps**: `brightness`, `controlledLightEntityId`, `currentControlRestoreKey`, `effectiveControlScope`, `ensureGroupRelativeLayout`, `entityId`, `hass`, `hue`, `isOn`, `kelvin`, `markInteraction`, `rememberLastLitControlSettings`, `rememberLastLitGroupRelativeLayout`, `restoreRememberedControllerState`, `saturation`, `selectedColorHue`, `stopDiscoMode`, `uiMode`

**The real issue**: The toggle logic reads `!isOn` to determine next state, but this happens BEFORE `setIsOn()` is called. The actual HA state is not checked - it's using React state which can be stale.

**Fix needed**: Always check the actual HA light state when toggling, not React state. The callback should use a ref to access current state WITHOUT requiring it as a dependency.

---

### 2. **Favorite Save Creating Stale Closure - `currentFavoriteSettings`** (Line 1744)
**Problem**: `currentFavoriteSettings` is created fresh every render but included in `handleFavoriteSave` dependency array (line 1895).

```typescript
const currentFavoriteSettings: FavoriteSettings = {
    brightness,     // Changes frequently
    hue,            // Changes frequently  
    isOn,           // Changes frequently
    kelvin,         // Changes
    mode: uiMode,   // Changes
    saturation,     // Changes frequently
    selectedColorHue,  // Can change
};

// Then used in handleFavoriteSave which has this dep:
const handleFavoriteSave = useCallback(() => {
    // ... uses currentFavoriteSettings ...
}, [
    buildFavoriteSettingsFromLight,
    controlledLightEntityId,
    currentFavoriteSettings,  // ← RECREATED EVERY RENDER
    entityId,
    effectiveControlScope,
    favoritePresets,
    groupLight,
    groupedLightIds,
    hass,
    light,
]);
```

**Impact**: 
- `handleFavoriteSave` callback is recreated on EVERY state change
- When save is triggered at the wrong time, it captures inconsistent state
- The UI might show save button working but favorites not actually saved

**Fix needed**: Use `useMemo` to memoize `currentFavoriteSettings` OR build it inside the callback using refs to current state.

---

### 3. **Race Condition in Toggle Logic** (Line 1588-1625)
**Problem**: The toggle sets local state THEN calls HA service, but order of operations can be wrong:

```typescript
const handleToggle = useCallback(() => {
    // ... state cleanup ...
    setIsOn(nextState);  // ← React state update (queued)
    markInteraction(1000);
    // ...
    
    if (nextState && restoreRememberedControllerState(...)) {
        return;  // ← May exit early without calling HA!
    }
    
    callLightService(hass, targetEntityId, nextState);  // ← Actual HA call
}, [...]
```

**Issues**:
- If `restoreRememberedControllerState()` returns true, the function exits WITHOUT calling `callLightService`
- But `setIsOn()` was already called, so UI shows light is on but HA wasn't updated
- This explains why toggle "works sometimes" - it depends on whether restore state succeeds

**Fix needed**: Only call `setIsOn()` AFTER successfully calling `callLightService`, or always call the service regardless.

---

### 4. **Favorite Apply Has Missing Dependency** (Line 2126)
**Problem**: `handleFavoriteApply` calls `queueFavoriteSceneActivation` but it's in dependencies:

```typescript
const handleFavoriteApply = useCallback(
    (favoriteId: string) => {
        // ... sets all state ...
        queueFavoriteSceneActivation(favorite);  // ← Called here
    },
    [
        clearInteractionLock,
        entityId,
        favoritePresets,
        lockUiModeSync,
        markInteraction,
        queueFavoriteSceneActivation,  // ← In deps, good
        // ... BUT ...
        rememberLastLitControlSettings,  // ← This is used in the callback but...
    ]
);
```

The callback uses several state setters that aren't in dependencies (setUiMode, setSelectedColorHue, setIsOn, etc). However, setState functions are stable so this isn't the issue - but the logic to determine which entity to use for `rememberLastLitControlSettings` might be using stale scope info.

---

### 5. **Favorite Delete Async State Issue** (Line 1982)
**Problem**: Delete starts async operation but immediately calls `setFavoritePresets()` before deletion completes:

```typescript
const handleFavoriteDelete = useCallback((favoriteId: string) => {
    void (async () => {  // ← Fire and forget
        // ...
        try {
            await deleteScene(hass, ...)  // ← Network call
        } catch (error) {
            // Handle error
        }
        // By this time, multiple deletes could be in flight!
        setFavoritePresets(nextFavorites);
    })();
}, [entityId, favoritePresets, hass]);
```

**Issues**:
- Multiple deletes triggered rapidly will all see the same `favoritePresets` state
- The UI updates immediately but HA deletions are in flight
- If one deletion fails, the UI doesn't reflect that

**Fix needed**: Queue the deletions properly and track in-flight operations, or disable the delete button during operation.

---

## Summary of Root Causes

| Feature | Problem | Why It's Unpredictable | 
|---------|---------|----------------------|
| **Toggle on/off** | Uses React state instead of actual HA state; early exit without service call | Works sometimes depending on restore state logic |
| **Save favorites** | `currentFavoriteSettings` recreated every render, callback unstable | Saves inconsistent data intermittently |
| **Apply/Use favorites** | State captures at wrong time; multiple rapid applies can conflict | Works for first apply, fails on quick re-apply |
| **Delete favorites** | Multiple deletes in flight see same old state; no operation queueing | Deletes fail silently or UI desync occurs |

## Recommended Fixes (Priority Order)

1. **Fix toggle logic** - Check actual HA state, not React state. Use refs for current values.
2. **Memoize `currentFavoriteSettings`** - Stabilize the save callback
3. **Fix async delete queueing** - Prevent race conditions in favorite deletion
4. **Add request deduplication** - Prevent duplicate toggle/apply requests within settling window
