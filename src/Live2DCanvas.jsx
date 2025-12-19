import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react'
import * as PIXI from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display/cubism4'

// Required for Live2DModel to work
window.PIXI = PIXI

const LONG_PRESS_DURATION = 500 // ms for long press detection

const Live2DCanvas = forwardRef(({
    modelPath,
    width = 400,
    height = 600,
    onModelLoad,
    onModelError,
    onHitAreaTap,
    onLongPress,  // NEW: Long press callback
    currentExpression // NEW: Accept expression as prop for reactivity
}, ref) => {
    const canvasRef = useRef(null)
    const appRef = useRef(null)
    const modelRef = useRef(null)
    const longPressTimerRef = useRef(null) // For long press detection
    const pressedAreasRef = useRef([]) // Store hit areas during press
    const touchCoordsRef = useRef({ x: 0, y: 0 }) // Store touch coordinates
    const [debugInfo, setDebugInfo] = useState({ expression: 'none', status: 'initializing' })

    // Ref to hold the latest callback to avoid stale closures in useEffect
    const onHitAreaTapRef = useRef(onHitAreaTap)
    const onLongPressRef = useRef(onLongPress)

    // Update refs when props change
    useEffect(() => {
        onHitAreaTapRef.current = onHitAreaTap
        onLongPressRef.current = onLongPress
    }, [onHitAreaTap, onLongPress])

    // Expose model methods to parent component
    useImperativeHandle(ref, () => ({
        // Set expression by name
        setExpression: (expressionName) => {
            console.log('🎭 Live2DCanvas.setExpression called with:', expressionName)
            console.log('🎭 modelRef.current exists:', !!modelRef.current)
            if (modelRef.current) {
                try {
                    // 1. Set Expression
                    console.log('🎭 Calling model.expression()...')
                    modelRef.current.expression(expressionName)

                    // 2. Play matching motion (Search ALL groups)
                    const innerModel = modelRef.current.internalModel
                    const motionManager = innerModel.motionManager
                    let foundGroup = null
                    let foundIndex = -1

                    // definitions is { group: [ { File: '...' } ] }
                    const definitions = (motionManager && motionManager.definitions) ||
                        (innerModel.settings && innerModel.settings.motions)

                    if (definitions) {
                        for (const group of Object.keys(definitions)) {
                            const list = definitions[group]
                            if (!Array.isArray(list)) continue;
                            const idx = list.findIndex(def => {
                                const path = def.File || def.file || ''
                                // Case insensitive check
                                return path.toLowerCase().includes(expressionName.toLowerCase() + '.motion3.json')
                            })
                            if (idx !== -1) {
                                foundGroup = group
                                foundIndex = idx
                                break
                            }
                        }
                    }

                    let motionStatus = 'Expr Only'
                    if (foundIndex !== -1) {
                        // Priority 3 = FORCE
                        modelRef.current.motion(foundGroup, foundIndex, 3)
                        motionStatus = `Mot: ${expressionName}`
                    } else {
                        motionStatus = 'Mot NotFound'
                    }

                    setDebugInfo(prev => ({ ...prev, expression: expressionName, status: motionStatus }))

                } catch (e) {
                    console.warn('Expr/Mot Error:', expressionName, e)
                    setDebugInfo(prev => ({ ...prev, status: 'Error: ' + e.message }))
                }
            } else {
                setDebugInfo(prev => ({ ...prev, status: 'Model Not Ready' }))
            }
        },
        // Play motion by group and index
        playMotion: (group, index = 0, priority = 2) => {
            if (modelRef.current) {
                try {
                    modelRef.current.motion(group, index, priority)
                } catch (e) {
                    console.warn('Motion not found:', group, index)
                }
            }
        },
        // Get model reference for advanced usage
        getModel: () => modelRef.current,
        // Set lip sync value (0-1)
        setLipSync: (value) => {
            if (modelRef.current && modelRef.current.internalModel) {
                // Try to set mouth open parameter
                try {
                    const coreModel = modelRef.current.internalModel.coreModel
                    const paramIndex = coreModel.getParameterIndex('ParamMouthOpenY')
                    if (paramIndex >= 0) {
                        coreModel.setParameterValueByIndex(paramIndex, value)
                    }
                } catch (e) {
                    // Ignore if parameter not found
                }
            }
        }
    }))

    useEffect(() => {
        if (!modelPath) return

        let app = null
        let model = null
        let mounted = true

        const initLive2D = async () => {
            // Wait for next frame to ensure DOM is ready
            await new Promise(resolve => setTimeout(resolve, 100))

            if (!mounted || !canvasRef.current) return

            try {
                // Create Pixi Application (let PixiJS create its own canvas)
                app = new PIXI.Application({
                    width,
                    height,
                    backgroundAlpha: 0,
                    antialias: true,
                    resolution: 1
                })

                // Append the auto-created canvas to our container
                const container = canvasRef.current
                container.innerHTML = '' // Clear any previous content
                container.appendChild(app.view)
                app.view.style.width = '100%'
                app.view.style.height = '100%'

                appRef.current = app

                // Load Live2D model (encode path for Japanese characters)
                const encodedPath = encodeURI(modelPath)
                model = await Live2DModel.from(encodedPath, {
                    autoInteract: false, // We handle interaction ourselves
                    autoUpdate: true
                })
                modelRef.current = model

                // Scale and position model to fit canvas
                const scale = Math.min(
                    width / model.width,
                    height / model.height
                ) * 0.9
                model.scale.set(scale)
                model.anchor.set(0.5, 0.5)
                model.x = width / 2
                model.y = height / 2

                // Enable interaction
                model.interactive = true
                model.cursor = 'pointer'

                // --- Pointer Events for Tap & Long Press ---
                // We use pointer events instead of 'hit' to support both tap and long press

                let isLongPressTriggered = false

                model.on('pointerdown', (event) => {
                    // 1. Store PAGE coordinates for heart effect (not canvas coordinates)
                    // Pixi global is relative to canvas, we need page position
                    const canvasRect = container.getBoundingClientRect()
                    const pageX = canvasRect.left + event.data.global.x
                    const pageY = canvasRect.top + event.data.global.y
                    touchCoordsRef.current = { x: pageX, y: pageY }

                    // 2. Calculate Hit Area based on position
                    const localY = event.data.getLocalPosition(model).y
                    const relativeY = localY / model.height

                    let hitAreas = []
                    // Simple zone detection: top 40% = head, rest = body
                    if (relativeY < 0.4) {
                        hitAreas = ['HitArea'] // Head
                    } else {
                        hitAreas = ['HitArea2'] // Body
                    }

                    pressedAreasRef.current = hitAreas
                    isLongPressTriggered = false

                    // 3. Start Long Press Timer
                    longPressTimerRef.current = setTimeout(() => {
                        if (onLongPressRef.current && pressedAreasRef.current.length > 0) {
                            // Pass areas AND coordinates
                            onLongPressRef.current(pressedAreasRef.current, touchCoordsRef.current)
                            isLongPressTriggered = true
                        }
                    }, LONG_PRESS_DURATION)
                })

                model.on('pointerup', (event) => {
                    // Clear timer
                    if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current)
                        longPressTimerRef.current = null
                    }

                    // If not long press, treat as Tap
                    if (!isLongPressTriggered) {
                        if (onHitAreaTapRef.current && pressedAreasRef.current.length > 0) {
                            // Pass areas AND coordinates
                            onHitAreaTapRef.current(pressedAreasRef.current, touchCoordsRef.current)
                        }
                    }

                    pressedAreasRef.current = []
                })

                model.on('pointerupoutside', () => {
                    // Cancel everything if dragged outside
                    if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current)
                        longPressTimerRef.current = null
                    }
                    pressedAreasRef.current = []
                })

                // Add model to stage
                app.stage.addChild(model)

                // --- Auto Blink Logic ---
                // Manually handle blinking since autoInteract is false and model settings vary
                const blinkState = {
                    state: 'open', // open, closing, closed, opening
                    startTime: 0,
                    duration: 150, // total blink duration in ms
                    nextBlinkTime: Date.now() + Math.random() * 3000 + 2000
                }

                // Add blinking to Pixi ticker
                app.ticker.add(() => {
                    // Safety check
                    if (!model || !model.internalModel || !model.internalModel.coreModel) return

                    const now = Date.now()

                    // 1. Decide when to blink
                    if (blinkState.state === 'open' && now > blinkState.nextBlinkTime) {
                        blinkState.state = 'closing'
                        blinkState.startTime = now
                    }

                    // 2. Animate loop
                    let value = 1.0

                    if (blinkState.state === 'closing') {
                        const t = (now - blinkState.startTime) / (blinkState.duration / 2)
                        value = 1.0 - t
                        if (value <= 0) {
                            value = 0
                            blinkState.state = 'opening'
                            blinkState.startTime = now
                        }
                    } else if (blinkState.state === 'opening') {
                        const t = (now - blinkState.startTime) / (blinkState.duration / 2)
                        value = t
                        if (value >= 1.0) {
                            value = 1.0
                            blinkState.state = 'open'
                            blinkState.nextBlinkTime = now + Math.random() * 3000 + 3000 // 3-6s interval
                        }
                    } else {
                        // Keep open otherwise
                        value = 1.0
                    }

                    // 3. Apply to model parameters (Cubism 3/4 IDs)
                    const core = model.internalModel.coreModel
                    const eyeL = core.getParameterIndex('ParamEyeLOpen')
                    const eyeR = core.getParameterIndex('ParamEyeROpen')

                    // Force parameter update
                    if (eyeL >= 0) core.setParameterValueByIndex(eyeL, value)
                    if (eyeR >= 0) core.setParameterValueByIndex(eyeR, value)
                })

                if (onModelLoad) {
                    onModelLoad(model)
                    setDebugInfo(prev => ({ ...prev, status: 'Loaded' }))
                }
            } catch (error) {
                console.error('Live2D Model Load Error:', error)
                setDebugInfo(prev => ({ ...prev, status: 'Load Error' }))
                if (onModelError) {
                    onModelError(error)
                }
            }
        }

        initLive2D()

        // Cleanup
        return () => {
            mounted = false
            if (model) {
                model.destroy()
            }
            if (app) {
                app.destroy(true, { children: true })
            }
            modelRef.current = null
            appRef.current = null
        }
    }, [modelPath, width, height])

    // Reactively update expression when prop or model changes
    useEffect(() => {
        if (currentExpression && modelRef.current) {
            console.log('🎭 Prop update: Applying expression:', currentExpression)
            // Use internal helper or verify method availability
            // Since setExpression is defined in useImperativeHandle, we can't call it directly from here easily
            // unless we define it outside or duplicate logic.
            // Duplicating core logic for safety:
            try {
                modelRef.current.expression(currentExpression)

                // Motion logic (simplified)
                const innerModel = modelRef.current.internalModel
                const motionManager = innerModel.motionManager
                const definitions = (motionManager && motionManager.definitions) || (innerModel.settings && innerModel.settings.motions)

                if (definitions) {
                    let foundGroup = null, foundIndex = -1
                    for (const group of Object.keys(definitions)) {
                        const list = definitions[group]
                        if (!Array.isArray(list)) continue;
                        const idx = list.findIndex(def => {
                            const path = def.File || def.file || ''
                            return path.toLowerCase().includes(currentExpression.toLowerCase() + '.motion3.json')
                        })
                        if (idx !== -1) { foundGroup = group; foundIndex = idx; break; }
                    }
                    if (foundIndex !== -1) {
                        modelRef.current.motion(foundGroup, foundIndex, 3)
                    }
                }
            } catch (e) {
                console.warn('Failed to apply expression from prop:', e)
            }
        }
    }, [currentExpression, debugInfo.status]) // debugInfo.status 'Loaded' triggers this too

    return (
        <div
            ref={canvasRef}
            style={{
                width: width,
                height: height,
                touchAction: 'none', // Prevent scroll on touch
                position: 'relative'
            }}
        />
    )
})

Live2DCanvas.displayName = 'Live2DCanvas'

export default Live2DCanvas
