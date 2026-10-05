BEGIN;

-- Keep retired values valid for rolling compatibility and historical settings.
-- New application selections are limited to GPT-6 Luna and GPT-6.1 Sol.
ALTER TABLE "application_settings"
  DROP CONSTRAINT "application_settings_quote_model_check",
  DROP CONSTRAINT "application_settings_item_model_check",
  DROP CONSTRAINT "application_settings_client_document_model_check",
  ADD CONSTRAINT "application_settings_quote_model_check"
    CHECK ("quoteExtractionModel" IN ('gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-6-luna', 'gpt-6.1-sol')),
  ADD CONSTRAINT "application_settings_item_model_check"
    CHECK ("itemExtractionModel" IN ('gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-6-luna', 'gpt-6.1-sol')),
  ADD CONSTRAINT "application_settings_client_document_model_check"
    CHECK ("clientDocumentExtractionModel" IN ('gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-6-luna', 'gpt-6.1-sol'));

COMMIT;
