// Bridge between scratch-blocks callbacks (outside React) and the in-app
// dialogs rendered by <Dialogs />.

export type Tone = "looks" | "data" | "list" | "event" | "more" | "motion";

export type TextRequest = {
  kind: "text";
  title: string;
  label: string;
  initial: string;
  placeholder?: string;
  hint?: string;
  confirm: string;
  tone: Tone;
};

export type BlockRequest = { kind: "block"; initial: string; editing: boolean };

export type DialogRequest = TextRequest | BlockRequest;

type Pending = DialogRequest & { resolve: (value: string | null) => void };

let current: Pending | null = null;
let listener: ((p: Pending | null) => void) | null = null;

export function subscribeDialog(fn: (p: Pending | null) => void) {
  listener = fn;
  fn(current);
  return () => {
    if (listener === fn) listener = null;
  };
}

export function openDialog(request: DialogRequest): Promise<string | null> {
  // A second request cancels the first rather than stacking.
  current?.resolve(null);
  return new Promise((resolve) => {
    const pending: Pending = {
      ...request,
      resolve: (value) => {
        if (current === pending) {
          current = null;
          listener?.(null);
        }
        resolve(value);
      },
    };
    current = pending;
    listener?.(pending);
  });
}
