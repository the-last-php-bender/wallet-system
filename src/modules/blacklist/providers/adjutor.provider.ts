import axios from 'axios';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { AxiosInstance, AxiosError } from 'axios';
import { config } from '../../../../config/environment';
import { BadRequestException } from '../../../common/exceptions/http.exception';
import { ErrorLogger } from '../../../common/filters/error.middleware';
import { LogLevel, ErrorCode } from '../../../common/enums';

export interface IdentityVerificationRequest {
  bvn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phoneNumber?: string;
}

export interface AdjutorKarmaResponse {
  status: string;
  message: string;
  data: {
    karma_identity: string;
    amount_in_contention: string | null;
    reason: string | null;
    default_date: string | null;
    karma_type: { karma: string } | null;
    karma_identity_type: { identity_type: string } | null;
    reporting_entity: { name: string; email: string } | null;
  } | null;
  meta?: {
    cost: number;
    balance: number;
  };
}

export interface AdjutorBvnVerificationResult {
  isBlacklisted: boolean;
  isVerified: boolean;
  bvn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phoneNumber: string;
  watchList: boolean;
  fraudSuspected: boolean;
  responseMessage: string;
}

interface RequestMetadata {
  startTime: number;
}

interface ExtendedConfig extends InternalAxiosRequestConfig {
  metadata?: RequestMetadata;
}

export class AdjutorProvider {
  private readonly client: AxiosInstance;
  private readonly timeout: number;
  private readonly serviceName: string = 'AdjutorKarmaAPI';

  constructor() {
    this.timeout = config.circuitBreaker.timeout;

    this.client = axios.create({
      baseURL: config.adjutor.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.adjutor.apiKey}`,
        'User-Agent': 'WalletEngine/1.0.0',
      },
      validateStatus: () => true,
    });

    this.client.interceptors.request.use(
      (conf: ExtendedConfig) => {
        conf.metadata = { startTime: Date.now() };
        return conf;
      },
      (error: AxiosError) => {
        ErrorLogger.log(LogLevel.ERROR, 'Adjutor request interceptor error', error as Error, {
          service: this.serviceName,
        });
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        const extendedConfig = response.config as ExtendedConfig;
        const durationMs = Date.now() - (extendedConfig.metadata?.startTime ?? Date.now());
        ErrorLogger.log(LogLevel.INFO, 'Adjutor API response received', new Error('log only'), {
          service: this.serviceName,
          durationMs,
        });
        return response;
      },
      (error: AxiosError) => {
        const extendedConfig = error.config as ExtendedConfig | undefined;
        const durationMs = Date.now() - (extendedConfig?.metadata?.startTime ?? Date.now());
        ErrorLogger.log(
          LogLevel.ERROR,
          'Adjutor API error intercepted',
          error as Error,
          {
            service: this.serviceName,
            durationMs,
          }
        );
        return Promise.reject(error);
      }
    );
  }

  public async verifyBvn(request: IdentityVerificationRequest): Promise<AdjutorBvnVerificationResult> {
    if (!request.bvn || request.bvn.trim().length === 0) {
      throw new BadRequestException(
        'BVN (Bank Verification Number) is required and cannot be empty.',
        ErrorCode.INVALID_BVN
      );
    }

    if (!/^\d{11}$/.test(request.bvn.trim())) {
      throw new BadRequestException(
        'BVN must be exactly 11 digits.',
        ErrorCode.INVALID_BVN_FORMAT
      );
    }

    if (!request.firstName || request.firstName.trim().length === 0) {
      throw new BadRequestException(
        'First name is required.',
        ErrorCode.INVALID_FIRST_NAME
      );
    }

    if (!request.lastName || request.lastName.trim().length === 0) {
      throw new BadRequestException(
        'Last name is required.',
        ErrorCode.INVALID_LAST_NAME
      );
    }

    if (!request.dateOfBirth || request.dateOfBirth.trim().length === 0) {
      throw new BadRequestException(
        'Date of birth is required.',
        ErrorCode.INVALID_DATE_OF_BIRTH
      );
    }

    try {
      const bvn = request.bvn.trim();
      const response = await this.client.get<AdjutorKarmaResponse>(
        `/verification/karma/${bvn}`
      );

      const statusCode = response.status;
      const payload = response.data;

      if (statusCode === 404) {
        return this.mapCleanResult(request, 'BVN not found in karma blacklist');
      }

      if (statusCode < 200 || statusCode >= 300) {
        throw new BadRequestException(
          'Identity verification service returned an error.',
          ErrorCode.ADJUTOR_API_ERROR
        );
      }

      if (!payload) {
        throw new BadRequestException(
          'Adjutor API returned null or undefined response payload.',
          ErrorCode.ADJUTOR_NULL_RESPONSE
        );
      }

      if (payload.status !== 'success') {
        return this.mapCleanResult(request, payload.message ?? 'Verification could not be completed');
      }

      if (!payload.data) {
        return this.mapCleanResult(request, payload.message ?? 'No data returned');
      }

      const isBlacklisted = true;
      const karmaType = payload.data.karma_type?.karma ?? 'Unknown';
      const identityType = payload.data.karma_identity_type?.identity_type ?? 'Unknown';

      return {
        isBlacklisted,
        isVerified: false,
        bvn,
        firstName: request.firstName,
        lastName: request.lastName,
        dateOfBirth: request.dateOfBirth,
        phoneNumber: request.phoneNumber ?? '',
        watchList: true,
        fraudSuspected: karmaType.toLowerCase().includes('fraud'),
        responseMessage: `BVN found in karma blacklist (${identityType}: ${karmaType})`,
      };
    } catch (error: unknown) {
      if (this.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.response?.status === 404) {
          return this.mapCleanResult(request, 'BVN not found in karma blacklist');
        }
        if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
          throw new BadRequestException(
            'Identity verification request timed out. Please try again.',
            ErrorCode.ADJUTOR_TIMEOUT
          );
        }
        if (axiosError.code === 'ENOTFOUND' || axiosError.code === 'ECONNREFUSED') {
          throw new BadRequestException(
            'Adjutor API host is unreachable. Please check your network connection.',
            ErrorCode.ADJUTOR_UNREACHABLE
          );
        }
        throw new BadRequestException(
          'Identity verification request failed.',
          ErrorCode.ADJUTOR_REQUEST_FAILED
        );
      }
      throw error;
    }
  }

  private isAxiosError(error: unknown): boolean {
    return (error as AxiosError)?.isAxiosError === true;
  }

  private mapCleanResult(
    request: IdentityVerificationRequest,
    responseMessage: string
  ): AdjutorBvnVerificationResult {
    return {
      isBlacklisted: false,
      isVerified: false,
      bvn: request.bvn,
      firstName: request.firstName,
      lastName: request.lastName,
      dateOfBirth: request.dateOfBirth,
      phoneNumber: request.phoneNumber ?? '',
      watchList: false,
      fraudSuspected: false,
      responseMessage: responseMessage ?? 'Verification could not be completed',
    };
  }
}