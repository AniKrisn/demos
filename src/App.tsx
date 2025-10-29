import { Tldraw, createShapeId, TLDefaultColorStyle, Editor, TLShapeId } from 'tldraw'
import 'tldraw/tldraw.css'
import { useState, useEffect, useRef } from 'react'

const NUM_CURSORS = 9
const GRID_ROWS = 10
const GRID_COLS = 10
const SHAPE_SIZE = 40
const SHAPE_SPACING = 50

// Rainbow colors for each cursor in the trail, plus the real mouse
const RAINBOW_COLORS: TLDefaultColorStyle[] = [
	'light-red',     // Real mouse cursor
	'red',           // Cursor 1
	'orange',        // Cursor 2
	'yellow',        // Cursor 3
	'light-green',   // Cursor 4
	'green',         // Cursor 5
	'light-blue',    // Cursor 6
	'blue',          // Cursor 7
	'violet',        // Cursor 8
	'light-violet'   // Cursor 9
]

export default function App() {
	const [cursorPositions, setCursorPositions] = useState(
		Array(NUM_CURSORS).fill({ x: 0, y: 0 })
	)
	const mousePosition = useRef({ x: 0, y: 0 })
	const animationFrameId = useRef<number>()
	const editorRef = useRef<Editor | null>(null)
	const shapeIdsRef = useRef<TLShapeId[]>([])

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			mousePosition.current = { x: e.clientX, y: e.clientY }
		}

		const animate = () => {
			setCursorPositions((prevPositions) => {
				const newPositions = [...prevPositions]
				
				// Each cursor follows the previous one (or the mouse for the first one)
				for (let i = 0; i < NUM_CURSORS; i++) {
					const target = i === 0 ? mousePosition.current : newPositions[i - 1]
					const current = prevPositions[i]
					
					const dx = target.x - current.x
					const dy = target.y - current.y
					
					// Each cursor has progressively more lag
					const baseLerp = 0.075
					const lerp = baseLerp * (1 - i * 0.1) // Each subsequent cursor is slower
					
					newPositions[i] = {
						x: current.x + dx * lerp,
						y: current.y + dy * lerp,
					}
				}

				// Check collision with all shapes using real mouse + all cursor images
				if (editorRef.current && shapeIdsRef.current.length > 0) {
					// For each shape, check which cursor (if any) is inside it
					shapeIdsRef.current.forEach(shapeId => {
						const shape = editorRef.current!.getShape(shapeId)
						if (shape && shape.type === 'geo') {
							const shapeBounds = editorRef.current!.getShapePageBounds(shape)
							if (shapeBounds) {
								// Check real mouse first, then all cursor images
								let cursorIndex = -1
								
								// Check real mouse position
								const realMousePagePoint = editorRef.current!.screenToPage({ 
									x: mousePosition.current.x, 
									y: mousePosition.current.y 
								})
								
								const realMouseInside = 
									realMousePagePoint.x >= shapeBounds.x &&
									realMousePagePoint.x <= shapeBounds.x + shapeBounds.w &&
									realMousePagePoint.y >= shapeBounds.y &&
									realMousePagePoint.y <= shapeBounds.y + shapeBounds.h
								
								if (realMouseInside) {
									cursorIndex = 0 // Real mouse uses index 0
								} else {
									// Check all cursor images
									for (let i = 0; i < NUM_CURSORS; i++) {
										const pagePoint = editorRef.current!.screenToPage({ 
											x: newPositions[i].x, 
											y: newPositions[i].y 
										})
										
										const isInside = 
											pagePoint.x >= shapeBounds.x &&
											pagePoint.x <= shapeBounds.x + shapeBounds.w &&
											pagePoint.y >= shapeBounds.y &&
											pagePoint.y <= shapeBounds.y + shapeBounds.h
										
										if (isInside) {
											cursorIndex = i + 1 // Offset by 1 for cursor images
											break // Use the first (lead) cursor's color
										}
									}
								}

								// Change shape color based on which cursor touched it
								const currentColor = (shape.props as any).color as TLDefaultColorStyle
								if (cursorIndex >= 0) {
									const newColor = RAINBOW_COLORS[cursorIndex]
									if (currentColor !== newColor) {
										editorRef.current!.updateShape({
											...shape,
											props: { ...(shape.props as any), color: newColor }
										})
									}
								} else if (currentColor !== 'grey') {
									editorRef.current!.updateShape({
										...shape,
										props: { ...(shape.props as any), color: 'grey' }
									})
								}
							}
						}
					})
				}
				
				return newPositions
			})
			
			animationFrameId.current = requestAnimationFrame(animate)
		}

		window.addEventListener('mousemove', handleMouseMove)
		animate()
		
		return () => {
			window.removeEventListener('mousemove', handleMouseMove)
			if (animationFrameId.current) {
				cancelAnimationFrame(animationFrameId.current)
			}
		}
	}, [])

	return (
		<div style={{ position: 'fixed', inset: 0 }}>
			<Tldraw 
				onMount={(editor) => {
					editorRef.current = editor
					
					// Create a grid of shapes
					const shapeIds: TLShapeId[] = []
					const startX = 100
					const startY = 100
					
					for (let row = 0; row < GRID_ROWS; row++) {
						for (let col = 0; col < GRID_COLS; col++) {
							const shapeId = createShapeId(`shape-${row}-${col}`)
							shapeIds.push(shapeId)
							
							editor.createShape({
								id: shapeId,
								type: 'geo',
								x: startX + col * SHAPE_SPACING,
								y: startY + row * SHAPE_SPACING,
								props: {
									geo: 'ellipse',
									w: SHAPE_SIZE,
									h: SHAPE_SIZE,
									color: 'grey',
									fill: 'solid',
								},
							})
						}
					}
					
					shapeIdsRef.current = shapeIds

					editor.zoomToFit()
					editor.setCameraOptions({ isLocked: true })
				}}
				components={{
					Minimap: null,
					MainMenu: null,
					QuickActions: null,
					PageMenu: null,
					ActionsMenu: null,
					ZoomMenu: null,
				}}
			/>
			{cursorPositions.map((pos, index) => (
				<img
					key={index}
					src="/assets/mac-cursor-6.png"
					alt={`cursor-${index}`}
					style={{
						position: 'fixed',
						left: pos.x,
						top: pos.y,
						width: '14px',
						height: '20px',
						pointerEvents: 'none',
						zIndex: 9999 - index, // Stack in order
						transform: 'translate(-2px, -2px)', // Adjust offset so tip is at cursor position
						opacity: 1 - index * 0.08, // Gradually fade the trailing cursors
					}}
				/>
			))}
		</div>
	)
}