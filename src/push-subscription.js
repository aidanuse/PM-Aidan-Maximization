function keyBytes(value) {
  if (!value) return null;
  if (ArrayBuffer.isView(value))
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(value);
}

// A browser can retain a subscription made with a previous server key after a
// deployment. Reusing it blindly registers successfully but cannot deliver push.
export async function currentPushSubscription(
  pushManager,
  applicationServerKey,
  removeOld,
) {
  let subscription = await pushManager.getSubscription();
  if (subscription) {
    const previous = keyBytes(subscription.options?.applicationServerKey);
    const current = keyBytes(applicationServerKey);
    const matches =
      previous &&
      previous.length === current.length &&
      previous.every((byte, i) => byte === current[i]);
    if (!matches) {
      if (!(await subscription.unsubscribe()))
        throw new Error(
          "Could not replace the old notification subscription. Close and reopen HARDBOND, then try again.",
        );
      await removeOld(subscription.endpoint);
      subscription = null;
    }
  }
  return (
    subscription ||
    pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
  );
}
