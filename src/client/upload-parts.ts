/** Wait for every in-flight part before exposing retry, and remember successful parts. */
export async function uploadMissingParts(
  parts: Array<{ key: string; send: () => Promise<void> }>,
  completed: string[],
  onCompleted: (keys: string[]) => void,
) {
  const done = new Set(completed);
  const results = await Promise.allSettled(
    parts
      .filter((part) => !done.has(part.key))
      .map(async (part) => {
        await part.send();
        done.add(part.key);
        onCompleted([...done]);
      }),
  );
  if (results.some((result) => result.status === "rejected")) throw new Error("一部の送信に失敗しました");
}
