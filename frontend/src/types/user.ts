export type User = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  alias: string
}

export type AuthPayload = {
  token: string
  user: User
}

export type RegisterInput = {
  firstName: string
  lastName: string
  email: string
  phone: string
  alias: string
  password: string
}
