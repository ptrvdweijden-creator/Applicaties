export type Role = "admin" | "magazijn" | "monteur";
export type MutationType = "ontvangst" | "afboeken" | "retour" | "correctie";

export type User = { id: string; email: string; name: string; role: Role; active: boolean };

export type Article = {
  id: string;
  article_number: string;
  description: string;
  category: string;
  barcodes: string[];
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
  type: MutationType;
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

export const MUTATION_LABELS: Record<MutationType, string> = {
  ontvangst: "Ontvangst",
  afboeken: "Afboeken",
  retour: "Retour",
  correctie: "Correctie",
};

export const MUTATION_ICONS: Record<MutationType, string> = {
  ontvangst: "arrow-down-circle",
  afboeken: "arrow-up-circle",
  retour: "return-down-back",
  correctie: "clipboard",
};

export const MUTATION_ROLES: Record<MutationType, Role[]> = {
  afboeken: ["admin", "magazijn", "monteur"],
  retour: ["admin", "magazijn", "monteur"],
  ontvangst: ["admin", "magazijn"],
  correctie: ["admin", "magazijn"],
};

export function newRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 8)}`;
}
