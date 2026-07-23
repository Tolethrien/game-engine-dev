type DeepOmit<T, K extends string> =
  T extends Array<infer U>
    ? Array<DeepOmit<U, K>>
    : K extends `${infer Head}.${infer Tail}`
      ? {
          [P in keyof T]: P extends Head ? DeepOmit<T[P], Tail> : T[P];
        }
      : Omit<T, K>;
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object
    ? T[P] extends Function
      ? T[P]
      : DeepPartial<T[P]>
    : T[P];
};
