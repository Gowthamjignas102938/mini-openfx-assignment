CREATE TABLE "balances" (
	"currency" varchar(3) PRIMARY KEY NOT NULL,
	"amount" numeric(18, 6) NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_currency" varchar(3) NOT NULL,
	"to_currency" varchar(3) NOT NULL,
	"from_amount" numeric(18, 6) NOT NULL,
	"to_amount" numeric(18, 6) NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
