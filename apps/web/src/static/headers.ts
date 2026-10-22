/** Browser JavaScript cannot inspect HttpOnly cookies. Identity always comes from the API. */
export async function cookies() {
  return {
    get: (name: string) => {
      const value = document.cookie
        .split("; ")
        .find((item) => item.startsWith(`${name}=`))
        ?.slice(name.length + 1);
      return value ? { name, value: decodeURIComponent(value) } : undefined;
    },
    toString: () => "",
  };
}
export async function headers() {
  return new Headers();
}
