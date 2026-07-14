type PersonLike = {
  firstName: string;
  lastName: string;
  nickname?: string | null;
  teamName?: string | null;
};

function trimText(value?: string | null) {
  return value?.trim() || "";
}

export function getPlayerDisplayName(person: PersonLike) {
  const nickname = trimText(person.nickname);
  if (nickname) return nickname;

  const teamName = trimText(person.teamName);
  if (teamName) return teamName;

  return `${person.firstName} ${person.lastName}`.trim();
}

export function getPlayerDisplaySubtext(person: PersonLike) {
  const nickname = trimText(person.nickname);
  if (nickname) {
    const lastInitial = person.lastName?.trim()?.[0];
    return `${person.firstName} ${lastInitial ? `${lastInitial}.` : ""}`.trim();
  }

  const teamName = trimText(person.teamName);
  if (teamName) {
    return `${person.firstName} ${person.lastName}`.trim();
  }

  return null;
}