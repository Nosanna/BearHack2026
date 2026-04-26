import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';

/**
 * Thin facade over AiService that the Repair and Appliance services
 * use for vision-only flows. Keeps the spec's vision/ai split intact.
 */
@Injectable()
export class VisionService {
  constructor(private readonly ai: AiService) {}

  detectAppliance(imageUrl: string) {
    return this.ai.topObjectFromGoogleVision(imageUrl).then((obj) => this.ai.detectApplianceFromImage(obj, imageUrl));
  }

  verifyPhoto(args: { imageUrl: string; expectedVisual: string[] }) {
    return this.ai.verifyPhoto(args);
  }
}
