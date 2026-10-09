export type Role = "admin" | "magazijn" | "monteur";
export type MutationType = "ontvangst" | "afboeken" | "retour" | "correctie";
export type MutationKind = MutationType | "beginvoorraad";

export type User = { id: string; email: string; name: string; role: Role; active: boolean };

export type BarcodeSvg = { filename: string; barcode_value: string; size: number; version: string; uploaded_at: string };

export type Article = {
  id: string;
  article_number: string;
  name: string;
  description: string;
  category: string;
  barcodes: string[];
  barcode_svg: BarcodeSvg | null;
  unit: string;
  physical_stock: number;
  reserved_stock: number;
  available_stock: number;
  min_stock: number;
  notes: string;
  active: boolean;
  below_min: boolean;
  updated_at: string;
};

export type Mutation = {
  id: string;
  article_id: string;
  article_number: string;
  article_description: string;
  type: MutationKind;
  quantity: number;
  delta: number;
  stock_before: number;
  stock_after: number;
  user_name: string;
  note: string;
  created_at: string;
};

export type Dashboard = {
  active_articles: number;
  below_min_count: number;
  below_min: Article[];
  mutations_24h: number;
  recent_mutations: Mutation[];
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Beheerder",
  magazijn: "Magazijn",
  monteur: "Monteur",
};

export const MUTATION_LABELS: Record<MutationKind, string> = {
  ontvangst: "Ontvangst",
  afboeken: "Afboeken",
  retour: "Retour",
  correctie: "Correctie",
  beginvoorraad: "Beginvoorraad",
};

export const MUTATION_ICONS: Record<MutationKind, string> = {
  ontvangst: "arrow-down-circle",
  afboeken: "arrow-up-circle",
  retour: "return-down-back",
  correctie: "clipboard",
  beginvoorraad: "flag",
};

export const articleTitle = (a: Pick<Article, "name" | "description">) => a.name || a.description;

export const MUTATION_ROLES: Record<MutationType, Role[]> = {
  afboeken: ["admin", "magazijn", "monteur"],
  retour: ["admin", "magazijn", "monteur"],
  ontvangst: ["admin", "magazijn"],
  correctie: ["admin", "magazijn"],
};

export function newRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 8)}`;
}
