export const useRouter = () => ({ push() {}, replace() {}, refresh() {} });
export const usePathname = () => (globalThis as { __DEMO_PATH__?: string }).__DEMO_PATH__ ?? "/today";
export const useSearchParams = () => new URLSearchParams();
export const redirect = () => {
  throw new Error("redirect is not available in the static demo");
};
export const notFound = redirect;
