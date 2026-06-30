-- SQL Migration Script to run in Supabase SQL Editor
-- This trigger automatically parses incoming SMS logs and reconciles the payment requests

-- 1. Create a function to parse SMS and match payments
CREATE OR REPLACE FUNCTION public.reconcile_pennywise_payment()
RETURNS TRIGGER AS $$
DECLARE
    parsed_amount NUMERIC(10, 2) := NULL;
    cleaned_body TEXT;
    match_record RECORD;
    pattern TEXT;
    match_result TEXT[];
    thirty_minutes_interval INTERVAL := '30 minutes'::INTERVAL;
BEGIN
    -- Normalize body: convert to lowercase and remove commas (thousand separators)
    cleaned_body := REPLACE(LOWER(NEW.body), ',', '');

    -- Try to match amount using various bank transaction SMS patterns
    -- Pattern A: RS. 100.00 / INR 100.00 / RUPEES 100.00
    match_result := regexp_matches(cleaned_body, '(?:rs\.?|inr|rupees)\s*([0-9]+(?:\.[0-9]{1,2})?)');
    
    -- Pattern B: credited with/by/of 100.00
    IF match_result IS NULL THEN
        match_result := regexp_matches(cleaned_body, 'credited\s+(?:with|by|of)?\s*(?:rs\.?|inr)?\s*([0-9]+(?:\.[0-9]{1,2})?)');
    END IF;
    
    -- Pattern C: received 100.00
    IF match_result IS NULL THEN
        match_result := regexp_matches(cleaned_body, 'received\s+(?:rs\.?|inr)?\s*([0-9]+(?:\.[0-9]{1,2})?)');
    END IF;

    -- Pattern D: deposited 100.00
    IF match_result IS NULL THEN
        match_result := regexp_matches(cleaned_body, 'deposited\s+(?:rs\.?|inr)?\s*([0-9]+(?:\.[0-9]{1,2})?)');
    END IF;

    -- Fallback: Look for any decimal number with 2 digits
    IF match_result IS NULL THEN
        match_result := regexp_matches(cleaned_body, '\b([0-9]+\.[0-9]{2})\b');
    END IF;

    -- If we matched an amount, convert to numeric
    IF match_result IS NOT NULL AND array_length(match_result, 1) >= 1 THEN
        parsed_amount := match_result[1]::NUMERIC(10, 2);
    END IF;

    -- If no amount could be parsed, mark SMS as unmatched and exit
    IF parsed_amount IS NULL OR parsed_amount <= 0 THEN
        UPDATE public.pennywise_sms_logs
        SET status = 'unmatched', parsed_amount = NULL
        WHERE id = NEW.id;
        RETURN NEW;
    END IF;

    -- Search for a matching payment request:
    -- Match amount exactly, and status must be 'pending' or expired within last 30 minutes.
    SELECT * INTO match_record
    FROM public.pennywise_payment_requests
    WHERE amount_exact = parsed_amount
      AND (
          status = 'pending' 
          OR (status = 'expired' AND updated_at >= timezone('utc'::text, now()) - thirty_minutes_interval)
      )
    LIMIT 1;

    -- If match is found, reconcile
    IF match_record.id IS NOT NULL THEN
        -- 1. Update the payment request to completed
        UPDATE public.pennywise_payment_requests
        SET status = 'completed', updated_at = timezone('utc'::text, now())
        WHERE id = match_record.id;

        -- 2. Update the SMS log to processed and attach the matched amount
        UPDATE public.pennywise_sms_logs
        SET status = 'processed', parsed_amount = parsed_amount
        WHERE id = NEW.id;
        
        -- Note: If you have a PMS users/subscriptions table, you can add update commands here:
        -- UPDATE public.users SET status = 'active', expires_at = now() + interval '30 days' WHERE id = match_record.user_id;

    ELSE
        -- No active or recently expired checkout matches this amount
        UPDATE public.pennywise_sms_logs
        SET status = 'unmatched', parsed_amount = parsed_amount
        WHERE id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create the AFTER INSERT trigger on SMS logs
DROP TRIGGER IF EXISTS trg_reconcile_pennywise_payment ON public.pennywise_sms_logs;
CREATE TRIGGER trg_reconcile_pennywise_payment
AFTER INSERT ON public.pennywise_sms_logs
FOR EACH ROW
EXECUTE FUNCTION public.reconcile_pennywise_payment();
