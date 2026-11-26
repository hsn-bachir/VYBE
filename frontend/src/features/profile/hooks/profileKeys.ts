export const profileKey = (owner: number) => ['me', owner, 'profile'] as const
export const publicProfileKey = (id: number) => ['public-profile', id] as const
