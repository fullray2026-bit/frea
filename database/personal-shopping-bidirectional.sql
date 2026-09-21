alter table public.personal_shopping_requests
  add column service_direction text not null default 'jp_to_tw' check (service_direction in ('jp_to_tw','tw_to_jp')),
  add column contact_language text not null default 'zh-Hant' check (contact_language in ('zh-Hant','ja')),
  add column quote_currency text not null default 'TWD',
  add column delivery_address jsonb not null default '{}'::jsonb check (jsonb_typeof(delivery_address)='object' and octet_length(delivery_address::text)<=6000),
  add column payment_method text not null default 'bank_transfer';
alter table public.personal_shopping_requests add constraint personal_direction_currency
  check ((service_direction='jp_to_tw' and quote_currency='TWD' and payment_method='bank_transfer') or
         (service_direction='tw_to_jp' and quote_currency='JPY' and payment_method='fukuoka_bank_atm'));
comment on column public.personal_shopping_requests.quote_details is 'Legacy jp_to_tw keys retained. tw_to_jp uses domestic_shipping_twd, duties_and_fees_jpy, international_shipping_jpy, japan_shipping_jpy, other_fees_jpy; exchange_rate is JPY per TWD.';

