/** Permisos presentacionales de M10. FastAPI es siempre la autoridad final. */
export type ProjectRole = 'owner' | 'manager' | 'engineer' | 'reviewer' | 'reader';
export type AssignableRole = Exclude<ProjectRole, 'owner'>;

export const ROLE_LABELS: Record<ProjectRole, string> = {
  owner: 'Propietario', manager: 'Responsable', engineer: 'Ingeniero',
  reviewer: 'Revisor', reader: 'Lector',
};

export const ASSIGNABLE_ROLES: { value: AssignableRole; label: string }[] = [
  { value: 'manager', label: 'Responsable' },
  { value: 'engineer', label: 'Ingeniero de IA' },
  { value: 'reviewer', label: 'Revisor' },
  { value: 'reader', label: 'Lector' },
];

export function canManageMember(actor: ProjectRole, target: ProjectRole): boolean {
  return actor === 'owner' ? target !== 'owner' : actor === 'manager' && target !== 'owner' && target !== 'manager';
}

export function availableRoles(actor: ProjectRole) {
  return actor === 'owner' ? ASSIGNABLE_ROLES : actor === 'manager'
    ? ASSIGNABLE_ROLES.filter(role => role.value !== 'manager') : [];
}
