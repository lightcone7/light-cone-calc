import type { SanitizedExpansionInputs } from './expansion';

const physicalConstants = {
  rhoConst: 1.7885e9, // 3 / (8 pi G)
  secInGy: 3.1536e16, // s / Gyr
  tempNow: 2.725, // CMB temperature now
  Hconv: 1 / 978, // Convert km/s/Mpc -> Gyr^-1
};

const planckModel = {
  H_0: 67.74, // H0 control
  OmegaL: 0.691, // OmegaL control
  Omega: 1, // Omega control
  s_eq: 1 + 3370, // Stretch when OmegaM=OmegaR
};

export const getModel = (inputs: SanitizedExpansionInputs) => {
  // Constants derived from inputs
  const { H_0, Hconv, Omega, OmegaL, rhoConst, secInGy, s_eq, tempNow } = {
    ...planckModel,
    ...physicalConstants,
  };

  const H0conv = H_0 * Hconv; // H0 in Gyr^-1
  const rhocritNow = rhoConst * (H0conv / secInGy) ** 2; // Critical density now

  //@TODO check this - should it be s_eq + 1 as the original, or as below
  // from Ibix?
  // const OmegaM = ((Omega - OmegaL) * s_eq) / (s_eq + 1); // Energy density of matter
  // const OmegaR = OmegaM / s_eq; // Energy density of radiation
  const OmegaM = ((Omega - OmegaL) * (s_eq + 1)) / (s_eq + 2); // Energy density of matter
  const OmegaR = OmegaM / (s_eq + 1); // Energy density of radiation

  const OmegaK = 1 - OmegaM - OmegaR - OmegaL; // Curvature energy density

  /**
   * Hubble constant as a function of stretch.
   *
   * @param s stretch = 1/a, where a is the usual FLRW scale factor.
   * @returns The Hubble constant at stretch s.
   */
  const H = (s: number) => {
    const s2 = s * s;
    return (
      H0conv *
      Math.sqrt(OmegaL + OmegaK * s2 + OmegaM * s2 * s + OmegaR * s2 * s2)
    );
  };

  const TH = (s: number): number => {
    const s2 = s * s;
    // Calculate the reciprocal of the time-dependent density.
    const H =
      H0conv *
      Math.sqrt(OmegaL + OmegaK * s2 + OmegaM * s2 * s + OmegaR * s2 * s2);
    return 1 / H;
  };

  const getParamsAtStretch = (s: number) => {
    const H_t = H(s);
    const s2 = s * s;
    // const hFactor = (H_0 / H_t) ** 2;
    const hFactor = (H0conv / H_t) ** 2;
    const OmegaMatterT = (Omega - OmegaL) * s2 * s * hFactor;
    const OmegaLambdaT = OmegaL * hFactor;
    const OmegaRadiationT = (OmegaMatterT * s) / s_eq;
    return {
      H_t,
      OmegaMatterT,
      OmegaLambdaT,
      OmegaRadiationT,
      TemperatureT: tempNow * s,
      rhocrit: rhoConst * (H_t / secInGy) ** 2,
      OmegaTotalT: OmegaMatterT + OmegaLambdaT + OmegaRadiationT,
    };
  };

  return {
    H_0,
    H0conv,
    H,
    TH,
    getParamsAtStretch,
  };
};