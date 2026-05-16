export async function syncBiometricsToFirestore(biometrics: any[], userId: string) {
  if (!biometrics.length) return;
  console.log(`BiometricSync stub: skipping Firestore sync for ${biometrics.length} records of user ${userId}`);
}
