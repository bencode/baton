// Domain entity identifier. ID generation (crypto.randomUUID etc.) lives server-side;
// shared only describes the type, staying free of runtime dependencies.
export type Id = string
