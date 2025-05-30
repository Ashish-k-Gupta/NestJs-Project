/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend'; // Import Resend SDK

// Define an interface for the email options to improve type safety
interface SendMailOptions {
  to: string | string[]; // Can be a single email or an array of emails
  subject: string;
  text?: string; // Optional plain text content
  html: string;
  from?: string; // Optional: If you want to allow overriding the default 'from'
}

@Injectable()
export class EmailService {
  private resend: Resend; // Declare Resend instance
  private readonly logger = new Logger(EmailService.name);
  private defaultFromAddress: string | undefined; // Store default from address

  constructor(private configService: ConfigService) {
    this.initializeResend();
  }

  private initializeResend() {
    try {
      const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
      this.defaultFromAddress =
        this.configService.get<string>('MAIL_FROM_ADDRESS'); // Get default from address

      if (!resendApiKey) {
        this.logger.error(
          'Missing RESEND_API_KEY environment variable. Email service will not function.',
        );
        // Consider if you want to throw an error here or handle it gracefully
        return;
      }
      if (!this.defaultFromAddress) {
        this.logger.error(
          'Missing MAIL_FROM_ADDRESS environment variable. Email service will not function correctly.',
        );
        return;
      }

      this.resend = new Resend(resendApiKey); // Initialize Resend with your API key
      this.logger.log('Resend email service initialized successfully.');
    } catch (error) {
      this.logger.error(
        'Failed to initialize Resend email service:',
        error.message,
        error.stack,
      );
      // Depending on your error handling strategy
    }
  }

  // Updated sendMail method to accept an object
  async sendMail(options: SendMailOptions): Promise<void> {
    try {
      if (!this.resend) {
        this.logger.error('Resend service not initialized. Cannot send email.');
        throw new InternalServerErrorException('Email service not ready.');
      }

      // Use provided 'from' address or default to MAIL_FROM_ADDRESS
      const fromAddress = options.from || this.defaultFromAddress;

      if (!fromAddress) {
        this.logger.error(
          'Email sender address not configured. Cannot send email.',
        );
        throw new InternalServerErrorException(
          'Email sender address not configured.',
        );
      }

      const { data, error } = await this.resend.emails.send({
        from: fromAddress, // Must be a verified domain in Resend
        to: Array.isArray(options.to) ? options.to : [options.to], // Ensure 'to' is an array
        subject: options.subject,
        html: options.html,
        text: options.text, // Pass plain text if provided, otherwise it's undefined
      });

      if (error) {
        this.logger.error('Failed to send email via Resend:', error.message);
        throw new InternalServerErrorException(
          `Failed to send email: ${error.message}`,
        );
      }

      this.logger.log(
        `Email sent successfully to ${Array.isArray(options.to) ? options.to.join(', ') : options.to}. Resend ID: ${data?.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Error sending email via Resend:`,
        error.message,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Failed to send email. Please try again later.',
      );
    }
  }
}
