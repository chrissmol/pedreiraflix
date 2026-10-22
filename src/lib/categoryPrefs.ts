/** Esconde e reordena categorias conforme o perfil (tela /categorias, como o "Manage groups" do TiviMate).
 * Categoria que nao esta em `order` (nova no provedor) fica no fim, na ordem do provedor. */
export function arrangeCategories<C extends { categoryId: string }>(
  kind: string,
  categories: C[],
  hidden: string[] = [],
  order: string[] = [],
): C[] {
  const hiddenSet = new Set(hidden)
  const position = new Map(order.map((key, i) => [key, i]))
  const at = (c: C) => position.get(`${kind}:${c.categoryId}`) ?? Infinity
  return categories.filter((c) => !hiddenSet.has(`${kind}:${c.categoryId}`)).sort((a, b) => at(a) - at(b))
}
