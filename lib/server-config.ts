export function serverConfig(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Serverkonfiguration mangler: ${name}`);
  return value;
}

export function serverConfigStatus() {
  const required = [
    "NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "FIREBASE_SERVICE_ACCOUNT_EMAIL", "FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY",
    "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_DKK", "STRIPE_PRICE_SEK",
  ];
  return required.filter(name => !process.env[name]);
}
