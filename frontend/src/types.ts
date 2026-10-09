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
  project?: string | null;
  reservation_id?: string | null;
  reservation_consumed?: number;
  created_at: string;
};

export type ReservationStatus = "actief" | "voltooid" | "opgeheven";

export type Reservation = {
  id: string;
  article_id: string;
  article_number: string;
  article_description: string;
  project: string;
  quantity: number;
  original_quantity: number;
  consumed_quantity: number;
  note: string;
  status: ReservationStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type ReservationEvent = {
  id: string;
  action: "aangemaakt" | "gewijzigd" | "afgeboekt" | "opgeheven" | "voltooid";
  quantity_before: number;
  quantity_after: number;
  project: string;
  note: string;
  changes: string;
  user_name: string;
  created_at: string;
};

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  actief: "Actief",
  voltooid: "Voltooid",
  opgeheven: "Opgeheven",
};

export type ProjectLine = Reservation & { article_unit?: string; article_physical_stock?: number; article_available_stock?: number };

export type Project = {
  id: string;
  name: string;
  note: string;
  status: "actief" | "vervallen";
  created_by: string;
  created_at: string;
  line_count: number;
  total_reserved: number;
  lines?: ProjectLine[];
};

export type OrderStatus = "besteld" | "gedeeltelijk_ontvangen" | "volledig_ontvangen";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  besteld: "Besteld",
  gedeeltelijk_ontvangen: "Gedeeltelijk ontvangen",
  volledig_ontvangen: "Volledig ontvangen",
};

export type OrderLine = {
  line_id: string;
  article_id: string;
  article_number: string;
  article_description: string;
  unit: string;
  ordered: number;
  received: number;
  open: number;
};

export type SupplierOrder = {
  id: string;
  order_number: string;
  supplier: string;
  order_date: string;
  expected_date: string | null;
  note: string;
  status: OrderStatus;
  lines: OrderLine[];
  version: number;
  created_by: string;
  total_ordered: number;
  total_received: number;
  receipts?: Mutation[];
  errors?: string[];
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
