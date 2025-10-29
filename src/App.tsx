import { Tldraw, createShapeId, TLDefaultColorStyle, Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { useState, useEffect, useRef } from 'react'

const CIRCLE_ID = createShapeId('target-circle')

export default function App() {
	const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 })
	const mousePosition = useRef({ x: 0, y: 0 })
	const animationFrameId = useRef<number>()
	const editorRef = useRef<Editor | null>(null)

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			mousePosition.current = { x: e.clientX, y: e.clientY }
		}

		const animate = () => {
			setCursorPosition((prev) => {
				const dx = mousePosition.current.x - prev.x
				const dy = mousePosition.current.y - prev.y
				
				// Lerp factor - smaller = slower chase (0.1 = 10% of the distance per frame)
				const lerp = 0.04
				
				const newPos = {
					x: prev.x + dx * lerp,
					y: prev.y + dy * lerp,
				}

				// Check collision with circle
				if (editorRef.current) {
					const circle = editorRef.current.getShape(CIRCLE_ID)
					if (circle && circle.type === 'geo') {
						const circleBounds = editorRef.current.getShapePageBounds(circle)
						if (circleBounds) {
							// Convert screen coordinates to page coordinates
							const pagePoint = editorRef.current.screenToPage({ x: newPos.x, y: newPos.y })
							
							// Check if cursor image is inside circle bounds
							const isInside = 
								pagePoint.x >= circleBounds.x &&
								pagePoint.x <= circleBounds.x + circleBounds.w &&
								pagePoint.y >= circleBounds.y &&
								pagePoint.y <= circleBounds.y + circleBounds.h

							// Change circle color based on collision
							const currentColor = (circle.props as any).color as TLDefaultColorStyle
							if (isInside && currentColor !== 'green') {
								editorRef.current.updateShape({
									...circle,
									props: { ...(circle.props as any), color: 'green' }
								})
							} else if (!isInside && currentColor !== 'blue') {
								editorRef.current.updateShape({
									...circle,
									props: { ...(circle.props as any), color: 'blue' }
								})
							}
						}
					}
				}
				
				return newPos
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
		<div style={{ position: 'fixed', inset: 0, cursor: 'none' }}>
			<Tldraw 
				onMount={(editor) => {
					editorRef.current = editor
					
					// Create a circle shape in the center
					editor.createShape({
						id: CIRCLE_ID,
						type: 'geo',
						props: {
							geo: 'ellipse',
							color: 'blue',
							fill: 'solid',
						},
					})

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
			<img
				src="/assets/mac-cursor-6.png"
				alt="cursor"
				style={{
					position: 'fixed',
					left: cursorPosition.x,
					top: cursorPosition.y,
					width: '24px',
					height: '24px',
					pointerEvents: 'none',
					zIndex: 9999,
					transform: 'translate(-4px, -4px)', // Adjust offset so tip is at cursor position
				}}
			/>
		</div>
	)
}