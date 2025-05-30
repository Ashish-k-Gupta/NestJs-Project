/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as Mail from 'nodemailer/lib/mailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);
  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAILERSEND_SMTP_HOST'),
      port: this.configService.get<number>('MAILERSEND_SMTP_PORT'),
      secure: this.configService.get<boolean>('MAILERSEND_SMTP_SECURE'),
      auth: {
        user: this.configService.get<string>('MAILERSEND_SMTP_USERNAME'),
        pass: this.configService.get<string>('MAILERSEND_SMTP_PASSWORD'),
      },
    });
    this.transporter.verify((error, _success) => {
      if (error) {
        this.logger.error(
          'Nodemailer configuration error with MailerSend:',
          error,
        );
      } else {
        this.logger.log('MailerSend SMTP server is ready to take our messages');
      }
    });
  }
  /**
   * Sends an email using the configured Nodemailer transporter.
   * @param options Mail options (to, from, subject, html/text, etc.)
   * @returns Promise<nodemailer.SentMessageInfo> Information about the sent email.
   * @throws InternalServerErrorException if email sending fails.
   */

  async sendMail(options: Mail.Options) {
    try {
      const info = await this.transporter.sendMail(options);
      this.logger.log(`Email sent: ${info.messageId}`);
      //   this.logger.debug(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      return info;
    } catch (error) {
      this.logger.error('Failed to send email via MailerSend:', error);
      throw new InternalServerErrorException(
        'Failed to send email. Please try again later.',
      );
    }
  }
}
