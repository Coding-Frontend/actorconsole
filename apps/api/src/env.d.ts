/// <reference types="node" />
declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV?: "development" | "production" | "test";
    DATABASE_URL?: string;
    REDIS_URL?: string;
    REDIS_ENABLED?: string;
    AUTH_SECRET?: string;
    AUTH_URL?: string;
    AUTH_TRUST_HOST?: string;
    APIFY_API_BASE_URL?: string;
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
