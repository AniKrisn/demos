import {
	BindingOnChangeOptions,
	BindingOnCreateOptions,
	BindingOnDeleteOptions,
	BindingOnShapeChangeOptions,
	BindingUtil,
	DefaultColorStyle,
	DefaultColorThemePalette,
	HTMLContainer,
	IndexKey,
	RecordProps,
	Rectangle2d,
	ShapeUtil,
	T,
	TLBaseBinding,
	TLBaseShape,
	TLDefaultColorStyle,
	Tldraw,
	Vec,
	clamp,
	createBindingId,
	createShapeId,
	getIndexBetween,
} from 'tldraw'
import 'tldraw/tldraw.css'

// The container shapes that can contain element shapes

const CONTAINER_PADDING = 24

type ContainerShape = TLBaseShape<'element', { height: number; width: number }>

class ContainerShapeUtil extends ShapeUtil<ContainerShape> {
	static override type = 'container' as const
	static override props: RecordProps<ContainerShape> = { height: T.number, width: T.number }

	override getDefaultProps() {
		return {
			width: 100 + CONTAINER_PADDING * 2,
			height: 100 + CONTAINER_PADDING * 2,
		}
	}

	override canBind({
		fromShapeType,
		toShapeType,
		bindingType,
	}: {
		fromShapeType: string
		toShapeType: string
		bindingType: string
	}) {
		return fromShapeType === 'container' && toShapeType === 'element' && bindingType === 'layout'
	}
	override canEdit() {
		return false
	}
	override canResize() {
		return false
	}
	override hideRotateHandle() {
		return true
	}
	override isAspectRatioLocked() {
		return true
	}

	override getGeometry(shape: ContainerShape) {
		return new Rectangle2d({
			width: shape.props.width,
			height: shape.props.height,
			isFilled: true,
		})
	}

	override component(shape: ContainerShape) {
		return (
			<HTMLContainer
				style={{
					backgroundColor: '#efefef',
					width: shape.props.width,
					height: shape.props.height,
				}}
			/>
		)
	}

	override indicator(shape: ContainerShape) {
		return <rect width={shape.props.width} height={shape.props.height} />
	}
}

// The element shapes that can be placed inside the container shapes

type ElementShape = TLBaseShape<'element', { w: number; h: number; color: TLDefaultColorStyle }>

class ElementShapeUtil extends ShapeUtil<ElementShape> {
	static override type = 'element' as const
	static override props: RecordProps<ElementShape> = {
		w: T.number,
		h: T.number,
		color: DefaultColorStyle,
	}

	override getDefaultProps(): ElementShape['props'] {
		return {
			w: 100,
			h: 100,
			color: 'blue' as TLDefaultColorStyle,
		}
	}

	override canBind({
		fromShapeType,
		toShapeType,
		bindingType,
	}: {
		fromShapeType: string
		toShapeType: string
		bindingType: string
	}) {
		return fromShapeType === 'container' && toShapeType === 'element' && bindingType === 'layout'
	}
	override canEdit() {
		return false
	}
	override canResize() {
		return false
	}
	override hideRotateHandle() {
		return true
	}
	override isAspectRatioLocked() {
		return true
	}

	override getGeometry(shape: ElementShape) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,
		})
	}

	override component(shape: ElementShape) {
		const theme = this.editor.user.getIsDarkMode() ? 'darkMode' : 'lightMode'
		const colorValue = DefaultColorThemePalette[theme][shape.props.color].solid
		
		return <HTMLContainer style={{ backgroundColor: colorValue, width: shape.props.w, height: shape.props.h }}></HTMLContainer>
	}

	override indicator(shape: ElementShape) {
		return <rect width={shape.props.w} height={shape.props.h} />
	}

	private getTargetContainer(shape: ElementShape, pageAnchor: Vec) {
		// Find the container shape that the element is being dropped on
		return this.editor.getShapeAtPoint(pageAnchor, {
			hitInside: true,
			filter: (otherShape) =>
				this.editor.canBindShapes({ fromShape: otherShape, toShape: shape, binding: 'layout' }),
		}) as ContainerShape | undefined
	}

	getBindingIndexForPosition(shape: ElementShape, container: ContainerShape, pageAnchor: Vec) {
		// All the layout bindings from the container
		const allBindings = this.editor
			.getBindingsFromShape<LayoutBinding>(container, 'layout')
			.sort((a, b) => (a.props.index > b.props.index ? 1 : -1))

		// Those bindings that don't involve the element
		const siblings = allBindings.filter((b) => b.toId !== shape.id)

		// Get the relative x position of the element center in the container
		// Where should the element be placed? min index at left, max index + 1
		const order = clamp(
			Math.round((pageAnchor.x - container.x - CONTAINER_PADDING) / (100 + CONTAINER_PADDING)),
			0,
			siblings.length + 1
		)

		// Get a fractional index between the two siblings
		const belowSib = allBindings[order - 1]
		const aboveSib = allBindings[order]
		let index: IndexKey

		if (belowSib?.toId === shape.id) {
			index = belowSib.props.index
		} else if (aboveSib?.toId === shape.id) {
			index = aboveSib.props.index
		} else {
			index = getIndexBetween(belowSib?.props.index, aboveSib?.props.index)
		}

		return index
	}

	override onTranslateStart(shape: ElementShape) {
		// Update all the layout bindings for this shape to be placeholders
		this.editor.updateBindings(
			this.editor.getBindingsToShape<LayoutBinding>(shape, 'layout').map((binding) => ({
				...binding,
				props: { ...binding.props, placeholder: true },
			}))
		)
	}

	override onTranslate(_: ElementShape, shape: ElementShape) {
		// Find the center of the element shape
		const pageAnchor = this.editor.getShapePageTransform(shape).applyToPoint({ x: 50, y: 50 })

		// Find the container shape that the element is being dropped on
		const targetContainer = this.getTargetContainer(shape, pageAnchor)

		if (!targetContainer) {
			// Delete all the bindings to the element
			const bindings = this.editor.getBindingsToShape<LayoutBinding>(shape, 'layout')
			this.editor.deleteBindings(bindings)
			return
		}

		// Get the index for the new binding
		const index = this.getBindingIndexForPosition(shape, targetContainer, pageAnchor)

		// Is there an existing binding already between the container and the shape?
		const existingBinding = this.editor
			.getBindingsFromShape<LayoutBinding>(targetContainer, 'layout')
			.find((b) => b.toId === shape.id)

		if (existingBinding) {
			// If a binding already exists, update it
			if (existingBinding.props.index === index) return
			this.editor.updateBinding<LayoutBinding>({
				...existingBinding,
				props: {
					...existingBinding.props,
					placeholder: true,
					index,
				},
			})
		} else {
			// ...otherwise, create a new one
			this.editor.createBinding<LayoutBinding>({
				id: createBindingId(),
				type: 'layout',
				fromId: targetContainer.id,
				toId: shape.id,
				props: {
					index,
					placeholder: true,
				},
			})
		}
	}

	override onTranslateEnd(_: ElementShape, shape: ElementShape) {
		// Find the center of the element shape
		const pageAnchor = this.editor.getShapePageTransform(shape).applyToPoint({ x: 50, y: 50 })

		// Find the container shape that the element is being dropped on
		const targetContainer = this.getTargetContainer(shape, pageAnchor)

		// No target container? no problem
		if (!targetContainer) return

		// get the index for the new binding
		const index = this.getBindingIndexForPosition(shape, targetContainer, pageAnchor)

		// delete all the previous bindings for this shape
		this.editor.deleteBindings(this.editor.getBindingsToShape<LayoutBinding>(shape, 'layout'))

		// ...and then create a new one
		this.editor.createBinding<LayoutBinding>({
			id: createBindingId(),
			type: 'layout',
			fromId: targetContainer.id,
			toId: shape.id,
			props: {
				index,
				placeholder: false,
			},
		})
	}
}

// The binding between the element shapes and the container shapes

type LayoutBinding = TLBaseBinding<
	'layout',
	{
		index: IndexKey
		placeholder: boolean
	}
>

class LayoutBindingUtil extends BindingUtil<LayoutBinding> {
	static override type = 'layout' as const

	override getDefaultProps() {
		return {
			index: 'a1' as IndexKey,
			placeholder: true,
		}
	}

	override onAfterCreate({ binding }: BindingOnCreateOptions<LayoutBinding>): void {
		this.updateElementsForContainer(binding)
	}

	override onAfterChange({ bindingAfter }: BindingOnChangeOptions<LayoutBinding>): void {
		this.updateElementsForContainer(bindingAfter)
	}

	override onAfterChangeFromShape({ binding }: BindingOnShapeChangeOptions<LayoutBinding>): void {
		this.updateElementsForContainer(binding)
	}

	override onAfterDelete({ binding }: BindingOnDeleteOptions<LayoutBinding>): void {
		this.updateElementsForContainer(binding)
	}

	private updateElementsForContainer({
		props: { placeholder },
		fromId: containerId,
		toId,
	}: LayoutBinding) {
		// Get all of the bindings from the layout container
		const container = this.editor.getShape<ContainerShape>(containerId)
		if (!container) return

		const bindings = this.editor
			.getBindingsFromShape<LayoutBinding>(container, 'layout')
			.sort((a, b) => (a.props.index > b.props.index ? 1 : -1))
		if (bindings.length === 0) return

		for (let i = 0; i < bindings.length; i++) {
			const binding = bindings[i]

			if (toId === binding.toId && placeholder) continue

			const offset = new Vec(CONTAINER_PADDING + i * (100 + CONTAINER_PADDING), CONTAINER_PADDING)

			const shape = this.editor.getShape<ElementShape>(binding.toId)
			if (!shape) continue

			const point = this.editor.getPointInParentSpace(
				shape,
				this.editor.getShapePageTransform(container)!.applyToPoint(offset)
			)

			if (shape.x !== point.x || shape.y !== point.y) {
				this.editor.updateShape({
					id: binding.toId,
					type: 'element',
					x: point.x,
					y: point.y,
				})
			}
		}

		const width =
			CONTAINER_PADDING +
			(bindings.length * 100 + (bindings.length - 1) * CONTAINER_PADDING) +
			CONTAINER_PADDING

		const height = CONTAINER_PADDING + 100 + CONTAINER_PADDING

		if (width !== container.props.width || height !== container.props.height) {
			this.editor.updateShape({
				id: container.id,
				type: 'container',
				props: { width, height },
			})
		}
	}
}

export default function LayoutConstraintsNew() {
	return (
		<div style={{ position: 'fixed', inset: 0 }}>
			<Tldraw
				onMount={(editor) => {
					;(window as any).editor = editor

					const containerId = createShapeId()
					editor.createShape({
						id: containerId,
						type: 'container',
						x: 200,
						y: 200,
						props: {
							width: 668,
							height: 148,
						},
					})

					const colors: TLDefaultColorStyle[] = ['red', 'orange', 'grey', 'green', 'light-violet']
					const elementIds = colors.map((color, i) => {
						const id = createShapeId()
						editor.createShape({
							id,
							type: 'element',
							x: 224 + i * 124,
							y: 224,
							props: { 
								w: 100, 
								h: 100, 
								color 
							},
						})
						return id
					})

					elementIds.forEach((elementId, i) => {
						editor.createBinding({
							id: createBindingId(),
							type: 'layout',
							fromId: containerId,
							toId: elementId,
							props: {
								index: `a${i + 1}` as IndexKey,
								placeholder: false,
							},
						})
					})

					editor.zoomToFit()
					editor.setCameraOptions({ isLocked: true })
				}}
			shapeUtils={[ContainerShapeUtil, ElementShapeUtil]}
			bindingUtils={[LayoutBindingUtil]}
			components={{
				Minimap: null,
				MainMenu: null,
				QuickActions: null,
				PageMenu: null,
				ActionsMenu: null,
				ZoomMenu: null,
			}}
			/>
		</div>
	)
}