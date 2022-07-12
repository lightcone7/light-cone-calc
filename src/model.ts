// cosmic-expansion/src/model.ts
import { numerical } from '@rec-math/math';

import * as physicalConstants from './physical-constants.js';
import { getStretchValues } from './stretch-range.js';
import * as surveyParameters from './survey-parameters.js';

import type {
  ExpansionInputs,
  ExpansionResult,
  IntegrationResult,
} from './expansion.js';

/**
 * H(s)^2 = H_0^2 (\Omega_m s^3 + \Omega_{rad} s^4 + \Omega_\Lambda s^{3(1+w)} + \Omega_k s^2 )
 */

interface CosmicExpansionVariables {
  h: number;
  omegaM: number;
  omegaLambda: number;
  omegaRad: number;
  temperature: number;
  rhoCrit: number;
}

/**
 * These parameters may be passed to `create()` to override default parameters.
 */
export interface LcdmModelParameters {
  /** Hubble constant \\( H_0 \\) (in km/s/Mpsc). */
  h0?: number;
  /** Total density paramater \\( \Omega_{tot} \\). */
  omega0?: number;
  /** Dark energy density parameter \\( \Omega_\Lambda \\). */
  omegaLambda0?: number;
  /** Redshift when matter and radiation densities were equal \\( z_{eq} \\). */
  zeq?: number;
  temperature0?: number;
  // Conversion: multiply (a hubble factor) km/s/Mpsc to get years * 10^9.
  kmsmpscToGyr?: number;
  // Conversion: multiply years * 10^9 to get seconds.
  gyrToSeconds?: number;

  rhoConst?: number;
}

interface CosmicExpansionModelProps {
  h0: number;
  h0Gy: number;
  omegaLambda0: number;
  OmegaK0: number;
  omegaM0: number;
  omegaRad0: number;
  rhoCrit0: number;
  /** Temperature of the cosmic microwave background radiation (K). */
  temperature0: number;

  /** $$ \frac{3}{8 \pi G} \approx 1.788 445 339 869 671 753 \times 10^9 $$ */
  rhoConst: number;
  /** Convert gigayears to seconds. */
  gyrToSeconds: number;
  /** Conversion factor for the Hubble parameter. */
  kmsmpscToGyr: number;
}

interface CosmicExpansionModelOptions {
  // The key of a survey to use for parameters (defaults to `planck2018`).
  survey?: 'planck2018' | 'planck2015' | 'wmap2013';
  [key: string]: any;
}

class CosmicExpansionModel {
  props: CosmicExpansionModelProps;

  getESquaredAtStretch: (s: number) => number;
  getVariablesAtStretch: (s: number) => CosmicExpansionVariables;

  constructor(options: CosmicExpansionModelOptions) {
    this.props = this.createProps(options);
    this.getESquaredAtStretch = this.createESquaredAtStretchFunction();
    // MUST create `this.getESquaredAtStretch` first.
    this.getVariablesAtStretch = this.createVariablesAtStretchFunction();
  }

  createProps(options: CosmicExpansionModelOptions): CosmicExpansionModelProps {
    // Constants derived from inputs
    const survey =
      options.survey && surveyParameters[options.survey]
        ? surveyParameters[options.survey]
        : surveyParameters['planck2018'];
    const props = {
      ...physicalConstants,
      ...survey,
      ...options,
    };

    const {
      kmsmpscToGyr,
      h0,
      omega0,
      omegaLambda0,
      zeq,

      gyrToSeconds,
      rhoConst,
    } = props;

    const h0Gy = h0 * kmsmpscToGyr;
    const seq = zeq + 1;
    const h0Seconds = (h0 * kmsmpscToGyr) / gyrToSeconds;

    // Calculate current density parameters.
    const rhoCrit0 = rhoConst * h0Seconds * h0Seconds;
    const omegaM0 = ((omega0 - omegaLambda0) * seq) / (seq + 1);
    const omegaRad0 = omegaM0 / seq;
    const OmegaK0 = 1 - omegaM0 - omegaRad0 - omegaLambda0;

    return {
      h0Gy,
      rhoCrit0,
      omegaM0,
      omegaRad0,
      OmegaK0,

      ...props,
    };
  }

  /**
   * Hubble constant as a function of stretch.
   *
   * @param s stretch = 1/a, where a is the usual FLRW scale factor.
   * @returns The Hubble constant at stretch s.
   */
  createESquaredAtStretchFunction() {
    const { omegaLambda0, OmegaK0, omegaM0, omegaRad0 } = this.props;
    return (s: number) => {
      const s2 = s * s;
      return (
        omegaLambda0 + OmegaK0 * s2 + omegaM0 * s2 * s + omegaRad0 * s2 * s2
      );
    };
  }

  createVariablesAtStretchFunction() {
    const { getESquaredAtStretch } = this;
    const { h0, temperature0, omegaLambda0, omegaM0, omegaRad0, rhoCrit0 } =
      this.props;
    return (s: number): CosmicExpansionVariables => {
      const eSquared = getESquaredAtStretch(s);
      const s2 = s * s;
      const h = h0 * Math.sqrt(eSquared);
      const omegaM = (omegaM0 * s2 * s) / eSquared;
      const omegaLambda = omegaLambda0 / eSquared;
      const omegaRad = (omegaRad0 * s2 * s2) / eSquared;
      return {
        h,
        omegaM,
        omegaLambda,
        omegaRad,
        temperature: temperature0 * s,
        rhoCrit: rhoCrit0 * eSquared,
      };
    };
  }

  getIntegralFunctions() {
    const { getESquaredAtStretch } = this;
    return {
      TH: (s: number): number => 1 / Math.sqrt(getESquaredAtStretch(s)),
      THs: (s: number): number => 1 / (s * Math.sqrt(getESquaredAtStretch(s))),
    };
  }

  /**
   * Get a list of cosmic expansion results for a range of stretch values.
   *
   * @param redshiftValues
   * @param inputs
   * @returns
   */
  calculateExpansionForStretchValues(
    stretchValues: number[]
  ): IntegrationResult[] {
    // Convert stretch values in descending order into integration points in
    // ascending order.
    const infty = Number.POSITIVE_INFINITY;
    const sPoints = stretchValues.slice().reverse();
    const isInfinityIncluded = sPoints[sPoints.length - 1] === infty;

    if (!isInfinityIncluded) {
      sPoints.push(infty);
    }

    // We assume zero is not included.
    sPoints.unshift(0);

    const { TH, THs } = this.getIntegralFunctions();

    const options = { epsilon: 1e-8 };

    const thResults = numerical.quad(TH, sPoints, options);
    const thPoints = thResults[1].points || [thResults];

    // Make sure we don't calculate THs at s = 0: discontinuity!
    const thsResults = numerical.quad(THs, sPoints.slice(1), options);
    // We may only have one point so this fix is needed.
    const thsPoints = thsResults[1].points || [thsResults];

    // Put in the initial value.
    thsPoints.unshift([0, { steps: 0, errorEstimate: 0, depth: 0 }]);

    const thAtOne = numerical.quad(TH, [0, 1], options)[0];
    const thAtInfinity = thResults[0];
    const thsAtInfinity = thsResults[0];

    // Create an array to build the return values.
    const results: IntegrationResult[] = [];

    // Discard the initial zero start point.
    sPoints.shift();
    const { h0Gy } = this.props;

    let th = 0;
    let ths = 0;
    for (let i = 0; i < sPoints.length - (isInfinityIncluded ? 0 : 1); ++i) {
      th += thPoints[i][0];
      ths += thsPoints[i][0];
      const s = sPoints[i];

      results.push({
        s,
        t: (thsAtInfinity - ths) / h0Gy,
        dNow: Math.abs(th - thAtOne) / h0Gy,
        dPar: (thAtInfinity - th) / s / h0Gy,
      });
    }

    return results;
  }

  createExpansionResults(
    integrationResults: IntegrationResult[]
  ): ExpansionResult[] {
    const { h0, h0Gy, kmsmpscToGyr } = this.props;

    const results: ExpansionResult[] = [];

    for (let i = integrationResults.length - 1; i >= 0; --i) {
      const { s, t, dNow: dUnsafe, dPar } = integrationResults[i];

      const params = this.getVariablesAtStretch(s);
      const hGy = params.h * kmsmpscToGyr;

      // Force dNow to zero at zero redshift.
      const dNow = s === 1 ? 0 : dUnsafe;
      results.push({
        z: s - 1,
        a: 1 / s,
        s,
        t,
        dNow,
        d: dNow / s,
        r: 1 / hGy,
        dPar,
        vGen: params.h / (s * h0),
        vNow: dNow * h0Gy,
        v: (dNow * hGy) / s,
        ...params,
      });
    }

    return results;
  }

  /**
   * Calculate the current age of the universe.
   *
   * @param inputs Inputs.
   * @returns
   */
  calculateAge(): number {
    // Do the integration.
    const { t } = this.calculateExpansionForStretchValues([1])[0];
    return t;
  }

  /**
   * Get a list of cosmic expansion results.
   *
   * @param inputs Inputs.
   * @returns
   */
  calculateExpansion(inputs: ExpansionInputs): ExpansionResult[] {
    // Calculate the values to calculate at.
    const stretchValues =
      inputs.stretch.length === 1
        ? // Pass the single point to calculate at.
          inputs.stretch
        : // Calculate multiple points.
          getStretchValues(inputs);

    // Do the integration.
    const integrationResults =
      this.calculateExpansionForStretchValues(stretchValues);

    // Create the tabulated results.
    const results = this.createExpansionResults(integrationResults);

    return results;
  }
}

export const create = (
  options: CosmicExpansionModelOptions = {}
): CosmicExpansionModel => {
  return new CosmicExpansionModel(options);
};
