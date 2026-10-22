// Read literal exported metadata without executing page modules or importing
// their backend/data-loading dependencies during the static build.
function literal(node) {
  if (!node) return undefined;
  if (["StringLiteral", "NumericLiteral", "BooleanLiteral"].includes(node.type)) return node.value;
  if (node.type === "NullLiteral") return null;
  if (["TSAsExpression", "TSSatisfiesExpression"].includes(node.type))
    return literal(node.expression);
  if (node.type === "ObjectExpression") {
    const result = {};
    for (const property of node.properties) {
      if (property.type !== "ObjectProperty" || property.computed) continue;
      const key = property.key.name ?? property.key.value;
      const value = literal(property.value);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  return undefined;
}
export function staticPageMetadata(program, file) {
  const normalized = file.replaceAll("\\", "/");
  const relative = normalized.split("/src/app/")[1];
  if (
    !relative ||
    !/(?:^|\/)page\.tsx$/.test(relative) ||
    (!relative.startsWith("(marketing)/") && relative !== "page.tsx") ||
    relative.includes("[")
  )
    return null;
  const path = `/${relative
    .replace(/(?:^|\/)page\.tsx$/, "")
    .split("/")
    .filter((part) => part && !part.startsWith("("))
    .join("/")}`;
  for (const statement of program.body) {
    const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : null;
    if (declaration?.type !== "VariableDeclaration") continue;
    for (const variable of declaration.declarations) {
      if (variable.id.name !== "metadata") continue;
      const metadata = literal(variable.init);
      if (metadata?.title) return { ...metadata, path };
    }
  }
  return null;
}
