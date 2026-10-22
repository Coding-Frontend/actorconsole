/// <reference types="node" />
declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV?: "development" | "production" | "test";
    DATABASE_URL?: string;
    REDIS_URL?: string;
    AUTH_SECRET?: string;
    AUTH_URL?: string;
    AUTH_TRUST_HOST?: string;
    AUTH_GITHUB_ID?: string;
    AUTH_GITHUB_SECRET?: string;
    APIFY_API_BASE_URL?: string;
    GITHUB_APP_ID?: string;
    GITHUB_APP_PRIVATE_KEY?: string;
    GITHUB_APP_WEBHOOK_SECRET?: string;
    GITHUB_APP_SLUG?: string;
    RAZORPAY_KEY_ID?: string;
    RAZORPAY_KEY_SECRET?: string;
    RAZORPAY_WEBHOOK_SECRET?: string;
    RAZORPAY_PLAN_ID_PRO?: string;
    ADMIN_API_KEY?: string;
    APP_ENCRYPTION_KEY?: string;
    API_PORT?: string;
    API_BASE_URL?: string;
    WEB_BASE_URL?: string;
    CORS_ORIGINS?: string;
    RESEND_API_KEY?: string;
    RESEND_FROM_EMAIL?: string;
    SUPPORT_EMAIL?: string;
    NEXT_PUBLIC_API_BASE_URL?: string;
  }
}
