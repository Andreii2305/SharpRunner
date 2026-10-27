export const createAssessmentAccountFence = ({
  getIdentity,
  subscribe,
  onIdentityChanged,
}) => {
  let disposed = false;
  let identity = getIdentity?.() ?? null;
  const unsubscribe = subscribe?.(() => {
    if (disposed) return;
    const nextIdentity = getIdentity?.() ?? null;
    if (nextIdentity === identity) return;
    const previousIdentity = identity;
    identity = nextIdentity;
    onIdentityChanged?.({ previousIdentity, identity: nextIdentity });
  });

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe?.();
    },
  };
};
