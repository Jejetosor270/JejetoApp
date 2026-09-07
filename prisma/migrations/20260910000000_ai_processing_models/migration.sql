-- NULL preserves each deployment's existing environment/default model until reviewed.
ALTER TABLE "application_settings"
  ADD COLUMN "quoteExtractionModel" VARCHAR(100),
  ADD COLUMN "itemExtractionModel" VARCHAR(100),
  ADD COLUMN "clientDocumentExtractionModel" VARCHAR(100),
  ADD CONSTRAINT "application_settings_quote_model_check"
    CHECK ("quoteExtractionModel" IN ('gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol')),
  ADD CONSTRAINT "application_settings_item_model_check"
    CHECK ("itemExtractionModel" IN ('gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol')),
  ADD CONSTRAINT "application_settings_client_document_model_check"
    CHECK ("clientDocumentExtractionModel" IN ('gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol'));
