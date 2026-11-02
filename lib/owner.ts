// "Relationship owner" on an investor is free text (usually a team member's name). Matches it to a team login.

export type TeamMember = { id: string; name: string; email: string };

/**
 * The team member an owner value refers to: their email, their full name, or a first name only one of them has
 * (case-insensitive). Null when nothing or more than one person matches.
 */
export function matchOwner(owner: string | null | undefined, team: TeamMember[]): TeamMember | null {
  const v = owner?.trim().toLowerCase();
  if (!v) return null;
  const byEmail = team.find((t) => t.email.toLowerCase() === v);
  if (byEmail) return byEmail;
  const byName = team.filter((t) => t.name.trim().toLowerCase() === v);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) return null;
  const byFirst = team.filter((t) => t.name.trim().toLowerCase().split(/\s+/)[0] === v);
  return byFirst.length === 1 ? byFirst[0] : null;
}

/** Who to copy on an email to an investor: the relationship owner, unless they're the sender or the recipient. */
export function ownerCc(owner: TeamMember | null, o: { to: string; senderId?: string | null }): string[] {
  if (!owner || owner.id === o.senderId || owner.email.toLowerCase() === o.to.toLowerCase()) return [];
  return [owner.email];
}
