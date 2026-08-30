import type { ReactElement } from "react";

/** Flattened visible text of a React element tree (works for @react-pdf too). */
export function treeText(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(treeText).join(" ");
  if (typeof node === "object" && node !== null && "props" in node) {
    const props = (node as ReactElement).props as { children?: unknown } | undefined;
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
  const props = el.props as { children?: unknown } | undefined;
  return treeHasType(props?.children, type);
}
