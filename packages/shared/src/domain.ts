export const userRoles = ["user", "manager", "admin"] as const;
export type UserRole = (typeof userRoles)[number];

export const checkStatuses = [
  "new",
  "pending",
  "reviewed",
  "discussion_required",
  "completed",
  "overdue",
] as const;
export type CheckStatus = (typeof checkStatuses)[number];

export const actionTakenOptions = [
  "removed",
  "left_on_shelf",
  "discounted",
  "returned",
  "checked_ok",
  "not_found",
  "other",
] as const;
export type ActionTaken = (typeof actionTakenOptions)[number];

export type AuditFields = {
  createdAt: string;
  updatedAt: string;
};

export type StoreRecord = AuditFields & {
  id: number;
  storeCode: string;
  storeName: string | null;
  isActive: boolean;
};

export type UserRecord = AuditFields & {
  id: number;
  storeId: number;
  name: string;
  surname: string;
  userChatId: string;
  role: UserRole;
  isActive: boolean;
};

export type ProductRecord = AuditFields & {
  id: number;
  article: string;
  barcode: string;
  productName: string;
  unitsOfMeasurement: string;
  category: string;
  isActive: boolean;
};

export type ProductBatchRecord = AuditFields & {
  id: number;
  productId: number;
  storeId: number;
  quantity: number;
  expiryDate: string;
  deliveryDate: string | null;
  notified: boolean;
  notifiedAt: string | null;
  notifiedDays: number;
  checkStatus: CheckStatus;
  checkedByUserId: number | null;
  checkedAt: string | null;
  actionTaken: ActionTaken | null;
  actionNote: string | null;
  discussionRequired: boolean;
  discussionNote: string | null;
  discussionRequestedByUserId: number | null;
  discussionRequestedAt: string | null;
  adminDecision: string | null;
  adminDecisionNote: string | null;
  adminDecisionByUserId: number | null;
  adminDecisionAt: string | null;
  createdByUserId: number | null;
  updatedByUserId: number | null;
};

export type ActivityLogRecord = {
  id: number;
  userId: number;
  actionType: string;
  batchId: number | null;
  productId: number | null;
  storeId: number | null;
  oldQuantity: number | null;
  newQuantity: number | null;
  oldExpiryDate: string | null;
  newExpiryDate: string | null;
  comment: string | null;
  createdAt: string;
};

export type NotificationLogRecord = {
  id: number;
  batchId: number | null;
  productId: number | null;
  storeId: number | null;
  userId: number | null;
  notificationType: string;
  messageText: string;
  sentAt: string;
};

export type UserSessionRecord = AuditFields & {
  id: number;
  userId: number;
  sessionKey: string;
  sessionState: Record<string, unknown>;
  expiresAt: string | null;
};
