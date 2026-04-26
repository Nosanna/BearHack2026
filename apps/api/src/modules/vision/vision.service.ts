import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import type { DetectPartsResponse, PartDetection } from '@fixit/shared';

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

  async detectParts(userId: string, imageUrl: string): Promise<DetectPartsResponse> {
    void userId;
    const base = (process.env.YOLO_SERVICE_URL ?? 'http://localhost:8008').replace(/\/$/, '');
    const res = await fetch(`${base}/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl }),
    });
    if (!res.ok) {
      throw new InternalServerErrorException(`YOLO service error (${res.status})`);
    }
    const data = (await res.json()) as unknown;
    if (!data || typeof data !== 'object' || !Array.isArray((data as any).detections)) {
      throw new InternalServerErrorException('YOLO service returned invalid JSON.');
    }
    const detections = (data as any).detections
      .filter((d: any) => d && typeof d === 'object')
      .map((d: any): PartDetection | null => {
        const label = typeof d.label === 'string' ? d.label : '';
        const confidence = Number(d.confidence);
        const bbox = d.bbox;
        const x = Number(bbox?.x);
        const y = Number(bbox?.y);
        const w = Number(bbox?.w);
        const h = Number(bbox?.h);
        if (!label) return null;
        if (![confidence, x, y, w, h].every(Number.isFinite)) return null;
        return { label, confidence: Math.max(0, Math.min(1, confidence)), bbox: { x, y, w, h } };
      })
      .filter(Boolean) as PartDetection[];
    return { detections };
  }
}
