import { HttpException } from './http.exception';
import { ErrorCode } from '../enums';

export class RepositoryException extends HttpException {
  public readonly detail: string;

  constructor(message: string, detail: string, errorCode: string = ErrorCode.INTERNAL_SERVER_ERROR) {
    super(500, errorCode, message);
    this.detail = detail;
    this.name = 'RepositoryException';
  }

  public override toJSON(): object {
    return super.toJSON();
  }
}

export class NotFoundException extends RepositoryException {
  constructor(entity: string) {
    super(
      `${entity} not found.`,
      'The requested resource does not exist.',
      ErrorCode.NOT_FOUND
    );
    this.name = 'NotFoundException';
  }
}
