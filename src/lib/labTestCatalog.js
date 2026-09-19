// Common lab tests, grouped — a quick-pick so doctors choose from a list
// (free text is still allowed for anything not listed).
export const LAB_TEST_GROUPS = {
  "Blood — basic": ["CBC (Complete Blood Count)", "Hemoglobin", "ESR", "Blood group & Rh", "Peripheral smear"],
  "Sugar / diabetes": ["Fasting blood sugar", "Post-prandial blood sugar", "Random blood sugar", "HbA1c"],
  "Liver / kidney": ["LFT (Liver Function Test)", "KFT (Kidney Function Test)", "Serum creatinine", "Blood urea", "Uric acid"],
  "Lipids / heart": ["Lipid profile", "Troponin", "CK-MB"],
  Thyroid: ["TSH", "T3, T4, TSH (Thyroid profile)"],
  Infection: ["Widal", "Malaria antigen", "Dengue NS1 / IgM", "CRP", "Blood culture", "Urine culture"],
  "Urine / stool": ["Urine routine", "Stool routine"],
  Vitamins: ["Vitamin D", "Vitamin B12"],
  Other: ["Pregnancy test (urine)", "PT / INR", "Electrolytes (Na, K, Cl)"],
};
