// Everyday imaging studies by modality — quick picks for the doctor, so the basics are always one click away
// even before a department has built its own catalogue.
export const COMMON_STUDIES = {
  "X-Ray": ["Chest PA", "Chest PA + Lateral", "Abdomen erect / supine", "KUB", "Spine Cervical AP/Lat", "Spine Lumbosacral AP/Lat", "Pelvis AP", "Knee AP/Lat", "Shoulder AP", "Hand / Wrist", "Foot / Ankle", "Skull AP/Lat", "PNS (Waters view)"],
  Ultrasound: ["USG Abdomen + Pelvis", "USG Upper Abdomen", "USG KUB", "USG Pelvis (Obstetric)", "USG Thyroid / Neck", "USG Scrotum", "USG Breast", "Doppler Lower Limb (Venous)"],
  CT: ["CT Head (Plain)", "CT Chest (HRCT)", "CT Abdomen + Pelvis", "CT PNS", "CT KUB", "CT Cervical Spine", "CT Angiography"],
  MRI: ["MRI Brain", "MRI Lumbosacral Spine", "MRI Cervical Spine", "MRI Knee", "MRI Shoulder", "MRI Abdomen (MRCP)"],
  Mammography: ["Mammography (Bilateral)"],
  Fluoroscopy: ["Barium Swallow", "Barium Meal", "MCU", "HSG"],
};

export const SAFETY_FLAGS = [
  ["PACEMAKER", "Pacemaker / ICD"],
  ["METAL_IMPLANT", "Metal implant / surgical clips"],
  ["CONTRAST_ALLERGY", "Known contrast allergy"],
  ["KIDNEY_DISEASE", "Kidney disease (needs recent creatinine / eGFR)"],
  ["DIABETIC_METFORMIN", "Diabetic on metformin"],
  ["CLAUSTROPHOBIA", "Claustrophobia"],
];

export const SAFETY_LABEL = Object.fromEntries(SAFETY_FLAGS);
export const CONTRAST_LABEL = { NONE: "Without contrast", WITH: "With contrast", LET_RADIOLOGIST_DECIDE: "Radiologist to decide" };
export const PREGNANCY_LABEL = { NOT_APPLICABLE: "Not applicable", NO: "Not pregnant", POSSIBLE: "Possibly pregnant", YES: "Pregnant" };
export const LATERALITY_LABEL = { NA: "—", LEFT: "Left", RIGHT: "Right", BOTH: "Both sides" };
