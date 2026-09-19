-- Patient referrals between hospitals/clinics: a third partner service type.
ALTER TABLE org_connections MODIFY service_type ENUM('LAB','PHARMACY','REFERRAL') NOT NULL;
