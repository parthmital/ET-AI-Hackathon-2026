"use client";

import type {
	ChangeEvent as ReactChangeEvent,
	ComponentType,
	ReactNode,
	ClipboardEvent as ReactClipboardEvent,
	KeyboardEvent as ReactKeyboardEvent,
	MouseEvent as ReactMouseEvent,
	HTMLAttributes,
} from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Files, FolderOpen, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { FormatDisplayLabel } from "@/lib/format";

export type IconType = ComponentType<{
	"aria-hidden"?: boolean | "true" | "false";
	className?: string;
	size?: number;
	strokeWidth?: number;
}>;

type IconTone = "slate" | "teal" | "amber" | "red" | "indigo" | "emerald";
type IconSize = "xs" | "sm" | "md" | "lg" | "xl";
type EditableSize = "sm" | "md" | "lg";
type CustomPressableType = "button" | "submit" | "reset";
type CustomPressableProps = HTMLAttributes<HTMLSpanElement> & {
	disabled?: boolean;
	type?: CustomPressableType;
};
type SelectOption =
	string | { label: string; value: string; disabled?: boolean };

const MimeByExtension: Record<string, string> = {
	".csv": "text/csv",
	".docx":
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".pdf": "application/pdf",
	".txt": "text/plain",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function cn(...classes: Array<string | false | null | undefined>) {
	return classes.filter(Boolean).join(" ");
}

export function AppIcon({
	icon: Icon,
	className,
	strokeWidth = 1.9,
}: {
	icon: IconType;
	className?: string;
	strokeWidth?: number;
}) {
	return (
		<Icon
			aria-hidden="true"
			className={cn("shrink-0 [vector-effect:non-scaling-stroke]", className)}
			strokeWidth={strokeWidth}
		/>
	);
}

export function IconFrame({
	icon: Icon,
	tone = "slate",
	size = "md",
	className,
}: {
	icon: IconType;
	tone?: IconTone;
	size?: IconSize;
	className?: string;
}) {
	const toneClass = {
		slate: "border-tone-slate-border bg-tone-slate-bg text-tone-slate-text",
		teal: "border-tone-teal-border bg-tone-teal-bg text-tone-teal-text",
		amber: "border-tone-amber-border bg-tone-amber-bg text-tone-amber-text",
		red: "border-tone-red-border bg-tone-red-bg text-tone-red-text",
		indigo: "border-tone-indigo-border bg-tone-indigo-bg text-tone-indigo-text",
		emerald:
			"border-tone-emerald-border bg-tone-emerald-bg text-tone-emerald-text",
	}[tone];
	const frameSizeClass = {
		xs: "size-7",
		sm: "size-8",
		md: "size-10",
		lg: "size-11",
		xl: "size-14",
	}[size];
	const iconSizeClass = {
		xs: "size-3.5",
		sm: "size-4",
		md: "size-5",
		lg: "size-5",
		xl: "size-7",
	}[size];

	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-lg border shadow-[var(--app-shadow-tight)]",
				frameSizeClass,
				toneClass,
				className,
			)}
		>
			<AppIcon className={iconSizeClass} icon={Icon} strokeWidth={1.8} />
		</span>
	);
}

function Pressable({
	children,
	className,
	disabled = false,
	onClick,
	onKeyDown,
	role = "button",
	tabIndex,
	type = "button",
	...props
}: CustomPressableProps) {
	function HandleClick(event: ReactMouseEvent<HTMLSpanElement>) {
		if (disabled) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		onClick?.(event);
		if (event.defaultPrevented) return;
		const form = event.currentTarget.closest("form");
		if (type === "submit") form?.requestSubmit();
		if (type === "reset") form?.reset();
	}

	function HandleKeyDown(event: ReactKeyboardEvent<HTMLSpanElement>) {
		onKeyDown?.(event);
		if (disabled || event.defaultPrevented) return;
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		event.currentTarget.click();
	}

	return (
		<span
			{...props}
			aria-disabled={disabled || undefined}
			className={cn(
				disabled ? "cursor-not-allowed" : "cursor-pointer",
				className,
			)}
			onClick={HandleClick}
			onKeyDown={HandleKeyDown}
			role={role}
			tabIndex={disabled ? -1 : (tabIndex ?? 0)}
		>
			{children}
		</span>
	);
}

export function Button({
	children,
	className,
	disabled = false,
	icon: Icon,
	variant = "primary",
	size = "md",
	...props
}: CustomPressableProps & {
	icon?: IconType;
	variant?: "primary" | "secondary" | "soft" | "danger" | "ghost";
	size?: "sm" | "md";
}) {
	const variantClass = {
		primary:
			"border-app-primary bg-app-primary text-app-on-primary shadow-[0_10px_24px_rgba(8,119,109,0.22)] hover:border-app-primary-hover hover:bg-app-primary-hover",
		secondary:
			"border-app-border bg-app-surface text-app-text shadow-[var(--app-shadow-tight)] hover:border-app-border-strong hover:bg-app-hover",
		soft: "border-tone-teal-border bg-tone-teal-bg text-tone-teal-text shadow-[var(--app-shadow-tight)] hover:border-app-primary hover:bg-app-hover",
		danger:
			"border-tone-red-border bg-tone-red-bg text-tone-red-text shadow-[var(--app-shadow-tight)] hover:border-tone-red-text hover:bg-app-hover",
		ghost:
			"border-transparent bg-transparent text-app-muted hover:bg-app-hover hover:text-app-text",
	}[variant];
	const sizeClass = size === "sm" ? "px-3 py-2 text-xs" : "px-4 py-2 text-sm";

	return (
		<Pressable
			className={cn(
				"inline-flex max-w-full items-center justify-center gap-2 rounded-lg border font-semibold leading-5 transition-all duration-200 ease-out active:scale-[0.98]",
				sizeClass,
				variantClass,
				disabled ? "cursor-not-allowed opacity-55" : "",
				className,
			)}
			disabled={disabled}
			{...props}
		>
			{Icon ? <AppIcon className="size-4" icon={Icon} /> : null}
			{children ? <span className="min-w-0 truncate">{children}</span> : null}
		</Pressable>
	);
}

export function IconButton({
	label,
	icon: Icon,
	className,
	disabled = false,
	...props
}: CustomPressableProps & {
	label: string;
	icon: IconType;
}) {
	return (
		<Pressable
			aria-label={label}
			title={label}
			className={cn(
				"inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-surface/70 text-app-muted shadow-[var(--app-shadow-tight)] transition-all duration-200 ease-out hover:border-app-border-strong hover:bg-app-hover hover:text-app-text active:scale-95",
				disabled ? "cursor-not-allowed opacity-50" : "",
				className,
			)}
			disabled={disabled}
			{...props}
		>
			<AppIcon className="size-4" icon={Icon} />
		</Pressable>
	);
}

export function ChoiceChip({
	children,
	className,
	disabled = false,
	selected = false,
	size = "xs",
	...props
}: CustomPressableProps & {
	selected?: boolean;
	size?: "xs" | "sm";
}) {
	return (
		<Pressable
			className={cn(
				"max-w-full rounded-lg border px-2.5 py-1.5 text-left leading-5 transition-all duration-200 ease-out active:scale-[0.98]",
				size === "sm" ? "text-sm font-semibold" : "text-xs font-semibold",
				selected
					? "border-app-primary bg-app-primary text-app-on-primary"
					: "border-app-border bg-transparent text-app-muted hover:border-app-border-strong hover:bg-app-hover",
				disabled ? "cursor-not-allowed opacity-55" : "",
				className,
			)}
			disabled={disabled}
			{...props}
		>
			{children}
		</Pressable>
	);
}

export function PanelButton({
	children,
	className,
	disabled = false,
	selected = false,
	...props
}: CustomPressableProps & {
	selected?: boolean;
}) {
	return (
		<Pressable
			className={cn(
				"block w-full min-w-0 rounded-lg border p-3 text-left transition-all duration-200 ease-out active:scale-[0.99]",
				selected
					? "border-app-primary bg-app-primary text-app-on-primary"
					: "border-app-border bg-transparent text-app-text hover:border-app-border-strong hover:bg-app-hover",
				disabled ? "cursor-not-allowed opacity-55" : "",
				className,
			)}
			disabled={disabled}
			{...props}
		>
			{children}
		</Pressable>
	);
}

export function MetricTile({
	label,
	value,
	meta,
	icon: Icon,
	tone = "slate",
}: {
	label: string;
	value: ReactNode;
	meta?: ReactNode;
	icon?: IconType;
	tone?: "slate" | "teal" | "amber" | "red" | "indigo";
}) {
	return (
		<div className="min-w-0 rounded-lg border border-app-border bg-app-surface p-4 shadow-[var(--app-shadow-tight)]">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="text-xs font-semibold text-app-subtle">{label}</p>
					<p className="mt-2 break-words text-2xl font-semibold leading-tight text-app-text">
						{value}
					</p>
				</div>
				{Icon ? (
					<AppIcon
						className={cn(
							"mt-0.5 size-4",
							tone === "red"
								? "text-tone-red-text"
								: tone === "amber"
									? "text-tone-amber-text"
									: tone === "indigo"
										? "text-tone-indigo-text"
										: tone === "teal"
											? "text-tone-teal-text"
											: "text-app-subtle",
						)}
						icon={Icon}
					/>
				) : null}
			</div>
			{meta ? (
				<div className="mt-2 min-w-0 text-sm leading-6 text-app-muted">
					{meta}
				</div>
			) : null}
		</div>
	);
}

export function EmptyState({
	icon: Icon,
	title,
	message,
	action,
}: {
	icon?: IconType;
	title: string;
	message: string;
	action?: ReactNode;
}) {
	return (
		<div className="rounded-lg border border-dashed border-app-border bg-app-panel/80 p-6 text-center shadow-[var(--app-shadow-tight)]">
			{Icon ? (
				<AppIcon className="mx-auto size-5 text-app-subtle" icon={Icon} />
			) : null}
			<p className={cn("font-semibold text-app-text", Icon ? "mt-2" : "")}>
				{title}
			</p>
			<p className="mx-auto mt-2 max-w-md text-sm leading-6 text-app-muted">
				{message}
			</p>
			{action ? <div className="mt-4">{action}</div> : null}
		</div>
	);
}

export function DisclosureSection({
	title,
	children,
	className,
	defaultOpen = false,
	summary,
}: {
	title: string;
	children: ReactNode;
	className?: string;
	defaultOpen?: boolean;
	summary?: ReactNode;
}) {
	const [isOpen, setIsOpen] = useState(defaultOpen);
	const contentId = useId();

	return (
		<section
			className={cn(
				"rounded-lg border border-app-border bg-app-surface shadow-[var(--app-shadow-tight)]",
				className,
			)}
		>
			<button
				aria-controls={contentId}
				aria-expanded={isOpen}
				className="flex w-full cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-left text-sm font-semibold text-app-text outline-none transition-all duration-200 ease-out hover:bg-app-hover focus:ring-2 focus:ring-app-focus/25 active:scale-[0.995]"
				onClick={() => setIsOpen((value) => !value)}
				type="button"
			>
				<span className="min-w-0 truncate">{title}</span>
				<span className="flex shrink-0 items-center gap-2">
					{summary ? (
						<span className="text-xs font-semibold text-app-subtle">
							{summary}
						</span>
					) : null}
					<AppIcon
						className={cn(
							"size-4 text-app-subtle transition-transform duration-200 ease-out",
							isOpen ? "rotate-180" : "",
						)}
						icon={ChevronDown}
					/>
				</span>
			</button>
			<AnimatePresence initial={false}>
				{isOpen ? (
					<motion.div
						animate={{ height: "auto", opacity: 1 }}
						className="overflow-hidden border-t border-app-border"
						exit={{ height: 0, opacity: 0 }}
						id={contentId}
						initial={{ height: 0, opacity: 0 }}
						role="region"
						transition={{ duration: 0.24, ease: "easeOut" }}
					>
						<div className="p-4">{children}</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</section>
	);
}

export function SkeletonBlock({ className }: { className?: string }) {
	return (
		<div
			className={cn("animate-pulse rounded-lg bg-app-skeleton", className)}
		/>
	);
}

function ReadEditableValue(element: HTMLDivElement, multiline: boolean) {
	const rawText = element.innerText.replace(/\u00a0/g, " ");
	const normalised = rawText === "\n" ? "" : rawText.replace(/\r\n/g, "\n");
	return multiline
		? normalised.replace(/\n$/, "")
		: normalised.replace(/[\n\r]+/g, " ");
}

function InsertPlainText(text: string) {
	const selection = window.getSelection();
	if (!selection?.rangeCount) return;
	selection.deleteFromDocument();
	selection.getRangeAt(0).insertNode(document.createTextNode(text));
	selection.collapseToEnd();
}

function EditableControl({
	ariaLabel,
	className,
	disabled,
	id,
	multiline = false,
	onEnter,
	onValueChange,
	placeholder,
	size = "md",
	value,
}: {
	ariaLabel?: string;
	className?: string;
	disabled?: boolean;
	id?: string;
	multiline?: boolean;
	onEnter?: () => void;
	onValueChange: (value: string) => void;
	placeholder?: string;
	size?: EditableSize;
	value: string;
}) {
	const editableRef = useRef<HTMLDivElement>(null);
	const isEmpty = !value;
	const sizeClass = {
		sm: "min-h-10 px-3 py-2 text-sm",
		md: "min-h-12 px-3 py-3 text-sm",
		lg: "min-h-32 p-4 text-sm leading-6",
	}[size];

	useEffect(() => {
		const element = editableRef.current;
		if (!element) return;
		if (ReadEditableValue(element, multiline) !== value) {
			element.textContent = value;
		}
	}, [multiline, value]);

	function HandleInput() {
		const element = editableRef.current;
		if (!element) return;
		onValueChange(ReadEditableValue(element, multiline));
	}

	function HandleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
		if (!multiline && event.key === "Enter") {
			event.preventDefault();
			if (onEnter) {
				onEnter();
				return;
			}
			event.currentTarget.closest("form")?.requestSubmit();
		}
	}

	function HandlePaste(event: ReactClipboardEvent<HTMLDivElement>) {
		event.preventDefault();
		const text = event.clipboardData.getData("text/plain");
		InsertPlainText(multiline ? text : text.replace(/[\n\r]+/g, " "));
		HandleInput();
	}

	return (
		<div className={cn("relative", className)}>
			{isEmpty && placeholder ? (
				<span
					className={cn(
						"pointer-events-none absolute left-3 right-3 text-app-placeholder",
						size === "lg" ? "top-4" : "top-1/2 -translate-y-1/2",
					)}
				>
					{placeholder}
				</span>
			) : null}
			<div
				aria-disabled={disabled || undefined}
				aria-label={ariaLabel ?? placeholder}
				aria-multiline={multiline || undefined}
				className={cn(
					"w-full rounded-lg border border-app-border bg-app-input text-app-text shadow-[var(--app-shadow-tight)] outline-none transition-all duration-200 ease-out focus:border-app-primary focus:ring-2 focus:ring-app-focus/25",
					multiline
						? "break-words whitespace-pre-wrap"
						: "overflow-hidden whitespace-nowrap",
					disabled ? "cursor-not-allowed opacity-55" : "cursor-text",
					sizeClass,
				)}
				contentEditable={!disabled}
				id={id}
				onInput={HandleInput}
				onKeyDown={HandleKeyDown}
				onPaste={HandlePaste}
				ref={editableRef}
				role="textbox"
				suppressContentEditableWarning
				tabIndex={disabled ? -1 : 0}
			/>
		</div>
	);
}

export function TextField({
	ariaLabel,
	className,
	disabled,
	id,
	onEnter,
	onValueChange,
	placeholder,
	size = "md",
	value,
}: {
	ariaLabel?: string;
	className?: string;
	disabled?: boolean;
	id?: string;
	onEnter?: () => void;
	onValueChange: (value: string) => void;
	placeholder?: string;
	size?: EditableSize;
	value: string;
}) {
	return (
		<EditableControl
			ariaLabel={ariaLabel}
			className={className}
			disabled={disabled}
			id={id}
			onEnter={onEnter}
			onValueChange={onValueChange}
			placeholder={placeholder}
			size={size}
			value={value}
		/>
	);
}

export function TextAreaField({
	ariaLabel,
	className,
	disabled,
	id,
	onValueChange,
	placeholder,
	value,
}: {
	ariaLabel?: string;
	className?: string;
	disabled?: boolean;
	id?: string;
	onValueChange: (value: string) => void;
	placeholder?: string;
	value: string;
}) {
	return (
		<EditableControl
			ariaLabel={ariaLabel}
			className={className}
			disabled={disabled}
			id={id}
			multiline
			onValueChange={onValueChange}
			placeholder={placeholder}
			size="lg"
			value={value}
		/>
	);
}

export function SearchInput({
	icon: Icon,
	className,
	onValueChange,
	placeholder,
	value,
}: {
	icon?: IconType;
	className?: string;
	onValueChange: (value: string) => void;
	placeholder?: string;
	value: string;
}) {
	return (
		<div className={cn("relative block w-full", className)}>
			{Icon ? (
				<AppIcon
					className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-subtle"
					icon={Icon}
					strokeWidth={1.8}
				/>
			) : null}
			<input
				aria-label={placeholder}
				className={cn(
					"h-10 w-full rounded-lg border border-app-border bg-app-input px-3 py-2 text-sm text-app-text shadow-[var(--app-shadow-tight)] outline-none transition-all duration-200 ease-out placeholder:text-app-placeholder focus:border-app-primary focus:ring-2 focus:ring-app-focus/25",
					Icon ? "pl-9" : "",
				)}
				onChange={(event: ReactChangeEvent<HTMLInputElement>) =>
					onValueChange(event.currentTarget.value)
				}
				placeholder={placeholder}
				type="search"
				value={value}
			/>
		</div>
	);
}

function NormaliseSelectOption(option: SelectOption) {
	return typeof option === "string"
		? { disabled: false, label: FormatDisplayLabel(option), value: option }
		: {
				disabled: Boolean(option.disabled),
				label: option.label,
				value: option.value,
			};
}

export function SelectField({
	ariaLabel,
	className,
	disabled = false,
	id,
	onValueChange,
	options,
	placeholder = "Select",
	value,
}: {
	ariaLabel?: string;
	className?: string;
	disabled?: boolean;
	id?: string;
	onValueChange: (value: string) => void;
	options: SelectOption[];
	placeholder?: string;
	value: string;
}) {
	const generatedId = useId();
	const listboxId = `${id ?? generatedId}-listbox`;
	const rootRef = useRef<HTMLDivElement | null>(null);
	const items = useMemo(() => options.map(NormaliseSelectOption), [options]);
	const selectedIndex = items.findIndex((item) => item.value === value);
	const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : null;
	const [isOpen, setIsOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(
		selectedIndex >= 0 ? selectedIndex : 0,
	);

	useEffect(() => {
		if (!isOpen) return;

		function HandlePointerDown(event: PointerEvent) {
			if (rootRef.current?.contains(event.target as Node)) return;
			setIsOpen(false);
		}

		document.addEventListener("pointerdown", HandlePointerDown);
		return () => document.removeEventListener("pointerdown", HandlePointerDown);
	}, [isOpen]);

	function FindEnabledIndex(
		selectItems: ReturnType<typeof NormaliseSelectOption>[],
		startIndex = 0,
		direction: 1 | -1 = 1,
	) {
		if (!selectItems.length) return -1;
		for (let offset = 0; offset < selectItems.length; offset += 1) {
			const index =
				(startIndex + offset * direction + selectItems.length) %
				selectItems.length;
			if (!selectItems[index].disabled) return index;
		}
		return -1;
	}

	function OpenMenu(nextActiveIndex = selectedIndex) {
		const enabledIndex =
			nextActiveIndex >= 0 && !items[nextActiveIndex]?.disabled
				? nextActiveIndex
				: FindEnabledIndex(items);
		setActiveIndex(enabledIndex);
		setIsOpen(true);
	}

	function MoveActive(direction: 1 | -1) {
		const nextIndex = FindEnabledIndex(
			items,
			activeIndex + direction,
			direction,
		);
		if (nextIndex >= 0) setActiveIndex(nextIndex);
	}

	function SelectIndex(index: number) {
		const item = items[index];
		if (!item || item.disabled) return;
		onValueChange(item.value);
		setIsOpen(false);
	}

	function HandleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
		if (disabled) return;
		if (event.key === "ArrowDown") {
			event.preventDefault();
			if (!isOpen) {
				OpenMenu(FindEnabledIndex(items, selectedIndex + 1, 1));
				return;
			}
			MoveActive(1);
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			if (!isOpen) {
				OpenMenu(FindEnabledIndex(items, selectedIndex - 1, -1));
				return;
			}
			MoveActive(-1);
		}
		if (event.key === "Home") {
			event.preventDefault();
			setActiveIndex(FindEnabledIndex(items));
		}
		if (event.key === "End") {
			event.preventDefault();
			setActiveIndex(FindEnabledIndex(items, items.length - 1, -1));
		}
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			if (isOpen) {
				SelectIndex(activeIndex);
				return;
			}
			OpenMenu();
		}
		if (event.key === "Escape") {
			event.preventDefault();
			setIsOpen(false);
		}
	}

	return (
		<div className={cn("relative", className)} ref={rootRef}>
			<Pressable
				aria-activedescendant={
					isOpen && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
				}
				aria-controls={listboxId}
				aria-expanded={isOpen}
				aria-haspopup="listbox"
				aria-label={ariaLabel ?? placeholder}
				className={cn(
					"flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-app-border bg-app-input px-3 text-left text-sm font-semibold text-app-text shadow-[var(--app-shadow-tight)] outline-none transition-all duration-200 ease-out focus:border-app-primary focus:ring-2 focus:ring-app-focus/25 active:scale-[0.99]",
					isOpen ? "border-app-primary ring-2 ring-app-focus/25" : "",
					disabled ? "cursor-not-allowed opacity-55" : "",
				)}
				disabled={disabled}
				id={id}
				onClick={() => (isOpen ? setIsOpen(false) : OpenMenu())}
				onKeyDown={HandleKeyDown}
				role="combobox"
			>
				<span
					className={cn(
						"min-w-0 truncate",
						selectedItem ? "" : "text-app-placeholder",
					)}
				>
					{selectedItem?.label ?? placeholder}
				</span>
				<AppIcon
					className={cn(
						"size-4 text-app-subtle transition-transform duration-200 ease-out",
						isOpen ? "rotate-180" : "",
					)}
					icon={ChevronDown}
				/>
			</Pressable>
			<AnimatePresence>
				{isOpen ? (
					<motion.div
						animate={{ opacity: 1, y: 0 }}
						className="absolute left-0 right-0 top-full z-40 mt-1 max-h-64 overflow-y-auto rounded-lg border border-app-border bg-app-elevated p-1 shadow-panel"
						exit={{ opacity: 0, y: -4 }}
						id={listboxId}
						initial={{ opacity: 0, y: -4 }}
						role="listbox"
						transition={{ duration: 0.16, ease: "easeOut" }}
					>
						{items.map((item, index) => {
							const isSelected = item.value === value;
							const isActive = index === activeIndex;
							return (
								<Pressable
									aria-selected={isSelected}
									className={cn(
										"flex w-full min-w-0 items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm font-semibold transition-all duration-200 ease-out active:scale-[0.99]",
										isActive
											? "bg-app-hover text-app-text"
											: "text-app-muted hover:bg-app-hover hover:text-app-text",
										isSelected ? "text-app-text" : "",
										item.disabled ? "cursor-not-allowed opacity-45" : "",
									)}
									disabled={item.disabled}
									id={`${listboxId}-${index}`}
									key={`${item.value}-${index}`}
									onClick={() => SelectIndex(index)}
									onMouseEnter={() => {
										if (!item.disabled) setActiveIndex(index);
									}}
									role="option"
									tabIndex={-1}
								>
									<span className="min-w-0 truncate">{item.label}</span>
									{isSelected ? (
										<AppIcon className="size-4 text-app-primary" icon={Check} />
									) : null}
								</Pressable>
							);
						})}
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}

export function SegmentedControl({
	options,
	value,
	onChange,
	className,
}: {
	options: string[];
	value: string;
	onChange: (value: string) => void;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex w-full max-w-full gap-1 overflow-x-auto rounded-lg bg-app-panel p-1 sm:inline-flex sm:w-auto sm:flex-wrap",
				className,
			)}
		>
			{options.map((option) => (
				<Pressable
					key={option}
					className={cn(
						"shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 ease-out active:scale-[0.98]",
						value === option
							? "bg-app-primary text-app-on-primary shadow-sm"
							: "text-app-muted hover:bg-app-hover hover:text-app-text",
					)}
					onClick={() => onChange(option)}
				>
					{FormatDisplayLabel(option)}
				</Pressable>
			))}
		</div>
	);
}

export function ProgressBar({
	value,
	tone = "teal",
}: {
	value: number;
	tone?: "teal" | "amber" | "red" | "indigo";
}) {
	const width = Math.max(0, Math.min(100, value));
	const toneClass = {
		teal: "bg-app-primary",
		amber: "bg-tone-amber-text",
		red: "bg-tone-red-text",
		indigo: "bg-tone-indigo-text",
	}[tone];

	return (
		<div className="h-2 overflow-hidden rounded-full bg-app-hover">
			<motion.div
				animate={{ width: `${width}%` }}
				className={cn("h-full rounded-full", toneClass)}
				initial={{ width: 0 }}
				transition={{ duration: 0.35 }}
			/>
		</div>
	);
}

export function CustomCheckbox({
	checked,
	children,
	className,
	onCheckedChange,
}: {
	checked: boolean;
	children: ReactNode;
	className?: string;
	onCheckedChange: (checked: boolean) => void;
}) {
	return (
		<Pressable
			aria-checked={checked}
			className={cn(
				"flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-lg border border-app-border bg-app-surface p-3 text-left text-sm leading-6 text-app-muted transition-all duration-200 ease-out hover:bg-app-hover focus:outline-none focus:ring-2 focus:ring-app-focus/25 active:scale-[0.99]",
				className,
			)}
			onClick={() => onCheckedChange(!checked)}
			role="checkbox"
		>
			<span
				className={cn(
					"mt-1 inline-flex size-4 shrink-0 items-center justify-center rounded border transition-all duration-200 ease-out",
					checked
						? "border-app-primary bg-app-primary text-app-on-primary"
						: "border-app-border-strong bg-app-panel text-transparent",
				)}
			>
				<AppIcon className="size-3" icon={Check} strokeWidth={2.5} />
			</span>
			<span
				className={cn(
					"min-w-0 break-words",
					checked ? "text-app-subtle line-through" : "",
				)}
			>
				{children}
			</span>
		</Pressable>
	);
}

export function FileDropZone({
	acceptExtensions,
	className,
	description,
	icon: Icon,
	isDragging,
	onDraggingChange,
	onFiles,
	title,
}: {
	acceptExtensions: string[];
	className?: string;
	description: string;
	icon: IconType;
	isDragging: boolean;
	onDraggingChange: (value: boolean) => void;
	onFiles: (files: File[] | FileList | null) => void;
	title: string;
}) {
	const [pickerMessage, setPickerMessage] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const folderInputRef = useRef<HTMLInputElement>(null);
	const acceptedMimeTypes = useMemo(
		() =>
			acceptExtensions
				.map((extension) => MimeByExtension[extension.toLowerCase()])
				.filter(Boolean)
				.join(","),
		[acceptExtensions],
	);
	const acceptValue = [acceptExtensions.join(","), acceptedMimeTypes]
		.filter(Boolean)
		.join(",");

	useEffect(() => {
		const folderInput = folderInputRef.current;
		if (!folderInput) return;
		folderInput.setAttribute("webkitdirectory", "");
		folderInput.setAttribute("directory", "");
	}, []);

	function PickFiles() {
		inputRef.current?.click();
	}

	function PickFolder() {
		folderInputRef.current?.click();
	}

	function HandleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		void PickFiles();
	}

	return (
		<div
			aria-label={`${title} upload area`}
			className={cn(
				"flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed p-5 text-center transition-all duration-200 ease-out sm:min-h-44",
				isDragging
					? "border-app-primary bg-tone-teal-bg"
					: "border-app-border-strong bg-app-panel hover:border-app-primary hover:bg-tone-teal-bg",
				className,
			)}
			onDragLeave={() => onDraggingChange(false)}
			onDragOver={(event) => {
				event.preventDefault();
				onDraggingChange(true);
			}}
			onDrop={(event) => {
				event.preventDefault();
				onDraggingChange(false);
				onFiles(event.dataTransfer.files);
			}}
			role="group"
		>
			<input
				aria-hidden="true"
				accept={acceptValue}
				className="hidden"
				multiple
				onChange={(event) => {
					onFiles(event.currentTarget.files);
					setPickerMessage("");
					event.currentTarget.value = "";
				}}
				onClick={(event) => event.stopPropagation()}
				ref={inputRef}
				tabIndex={-1}
				type="file"
			/>
			<input
				aria-hidden="true"
				accept={acceptValue}
				className="hidden"
				multiple
				onChange={(event) => {
					const files = event.currentTarget.files;
					onFiles(files);
					if (files?.length) {
						setPickerMessage(`${files.length} Files Selected From Folder.`);
					}
					event.currentTarget.value = "";
				}}
				onClick={(event) => event.stopPropagation()}
				ref={folderInputRef}
				tabIndex={-1}
				type="file"
			/>
			<button
				aria-label={title}
				className="flex w-full cursor-pointer flex-col items-center rounded-lg p-1 text-center outline-none transition-all duration-200 ease-out focus:ring-2 focus:ring-app-focus/25 active:scale-[0.995]"
				onClick={PickFiles}
				onKeyDown={HandleKeyDown}
				type="button"
			>
				<span className="inline-flex size-12 items-center justify-center rounded-lg border border-tone-teal-border bg-tone-teal-bg text-tone-teal-text">
					<AppIcon className="size-6" icon={Icon} />
				</span>
				<span className="mt-3 text-base font-semibold text-app-text">
					{title}
				</span>
				<span className="mt-2 max-w-sm text-sm leading-6 text-app-muted">
					{pickerMessage || description}
				</span>
			</button>
			<span className="mt-4 flex flex-wrap justify-center gap-2">
				<Pressable
					className="inline-flex items-center gap-2 rounded-lg border border-app-border bg-app-surface px-3 py-2 text-xs font-semibold text-app-text shadow-[var(--app-shadow-tight)] transition-all duration-200 ease-out hover:border-app-border-strong hover:bg-app-hover active:scale-[0.98]"
					onClick={(event) => {
						event.stopPropagation();
						PickFiles();
					}}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<AppIcon className="size-4" icon={Files} />
					Select Files
				</Pressable>
				<Pressable
					className="inline-flex items-center gap-2 rounded-lg border border-app-border bg-app-surface px-3 py-2 text-xs font-semibold text-app-text shadow-[var(--app-shadow-tight)] transition-all duration-200 ease-out hover:border-app-border-strong hover:bg-app-hover active:scale-[0.98]"
					onClick={(event) => {
						event.stopPropagation();
						PickFolder();
					}}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<AppIcon className="size-4" icon={FolderOpen} />
					Select Folder
				</Pressable>
			</span>
		</div>
	);
}

export function Toast({
	message,
	tone = "info",
	onClose,
}: {
	message: string;
	tone?: "info" | "success" | "error";
	onClose?: () => void;
}) {
	const toneClass = {
		info: "border-app-border bg-app-surface text-app-text",
		success: "border-tone-teal-border bg-tone-teal-bg text-tone-teal-text",
		error: "border-tone-red-border bg-tone-red-bg text-tone-red-text",
	}[tone];

	return (
		<AnimatePresence>
			{message ? (
				<motion.div
					animate={{ opacity: 1, y: 0 }}
					className={cn(
						"fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-start gap-3 rounded-lg border p-3 text-sm font-semibold shadow-panel sm:max-w-md",
						toneClass,
					)}
					exit={{ opacity: 0, y: 8 }}
					initial={{ opacity: 0, y: 8 }}
				>
					<span className="min-w-0 break-words leading-6">{message}</span>
					{onClose ? (
						<Pressable
							aria-label="Close Notification"
							className="shrink-0 rounded p-1 transition-all duration-200 ease-out hover:bg-app-hover active:scale-95"
							onClick={onClose}
						>
							<AppIcon className="size-4" icon={X} />
						</Pressable>
					) : null}
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}

export function EvidenceCard({
	document,
	page,
	snippet,
}: {
	document: string;
	page: number;
	snippet: string;
}) {
	return (
		<article className="rounded-lg border border-app-border bg-app-surface p-3">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<p className="min-w-0 max-w-full break-words text-sm font-semibold text-app-text">
					{document}
				</p>
				<span className="shrink-0 rounded-md bg-app-hover px-2 py-1 text-xs font-bold text-app-muted">
					Page {page}
				</span>
			</div>
			<p className="mt-2 line-clamp-3 break-words text-sm leading-6 text-app-muted">
				{snippet}
			</p>
		</article>
	);
}
