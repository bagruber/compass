// Every id looked up here is written in index.html. A missing one is a typo
// to fix, not a state to handle.
export const $ = (id: string) => document.getElementById(id)!;
