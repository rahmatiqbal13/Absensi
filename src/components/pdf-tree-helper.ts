import type { ReactElement } from "react";

/**
 * Renders plain function components (our own PDF building blocks, e.g. a
 * shared letterhead) so the helpers below see their output. react-pdf's own
 * primitives are string types and are left as-is.
 */
function expand(el: ReactElement): unknown {
  return typeof el.type === "function" ? (el.type as (p: unknown) => unknown)(el.props) : el;
}

/** Flattened visible text of a React element tree (works for @react-pdf too). */
export function treeText(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(treeText).join(" ");
  if (typeof node === "object" && node !== null && "props" in node) {
    const el = node as ReactElement;
    if (typeof el.type === "function") return treeText(expand(el));
    const props = el.props as { children?: unknown } | undefined;
    return treeText(props?.children);
  }
  return "";
}

/** True if any node in the tree has the given component as its `type`. */
export function treeHasType(node: unknown, type: unknown): boolean {
  if (node == null || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some((n) => treeHasType(n, type));
  const el = node as ReactElement;
  if (el.type === type) return true;
  if (typeof el.type === "function") return treeHasType(expand(el), type);
  const props = el.props as { children?: unknown } | undefined;
  return treeHasType(props?.children, type);
}
