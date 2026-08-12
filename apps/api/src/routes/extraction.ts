import { Router, type NextFunction, type Request, type Response, type Router as ExpressRouter } from 'express';
import { claimIdSchema, claimListSchema, extractionArticleIdSchema, extractionIdSchema, extractionListSchema } from '@suppliesignal/shared';
import { requireAuth, requireRole, type ResolveUser } from '../auth.js';
import { extractionService, type ExtractionService } from '../services/extraction.js';
const asyncHandler=(fn:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>void fn(req,res).catch(next);
const parse=<T>(schema:{safeParse(v:unknown):{success:true;data:unknown}|{success:false}},value:unknown,res:Response):T|null=>{const result=schema.safeParse(value);if(!result.success){res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Request validation failed'}});return null;}return result.data as T;};
export function createExtractionRouter(resolveUser:ResolveUser,service:ExtractionService=extractionService):ExpressRouter{const router=Router();router.use(requireAuth(resolveUser));const read=requireRole('ADMIN','REVIEWER');
router.get('/extraction-metrics',read,asyncHandler(async(_q,res)=>{res.json({data:await service.metrics()});}));
router.post('/source-articles/:articleId/extract',requireRole('ADMIN'),asyncHandler(async(req,res)=>{const p=parse<{articleId:string}>(extractionArticleIdSchema,req.params,res);if(p)res.status(202).json({data:await service.extract(p.articleId)});}));
router.post('/source-articles/:articleId/reprocess',requireRole('ADMIN'),asyncHandler(async(req,res)=>{const p=parse<{articleId:string}>(extractionArticleIdSchema,req.params,res);if(p)res.status(202).json({data:await service.extract(p.articleId,true)});}));
router.get('/source-articles/:articleId/extractions',read,asyncHandler(async(req,res)=>{const p=parse<{articleId:string}>(extractionArticleIdSchema,req.params,res);if(p)res.json({data:await service.articleRuns(p.articleId)});}));
router.get('/extractions',read,asyncHandler(async(req,res)=>{const q=parse<Record<string,unknown>>(extractionListSchema,req.query,res);if(q)res.json({data:await service.listExtractions(q as never)});}));
router.get('/extractions/:extractionId',read,asyncHandler(async(req,res)=>{const p=parse<{extractionId:string}>(extractionIdSchema,req.params,res);if(p)res.json({data:await service.get(p.extractionId)});}));
router.get('/claims',read,asyncHandler(async(req,res)=>{const q=parse<Record<string,unknown>>(claimListSchema,req.query,res);if(q)res.json({data:await service.listClaims(q as never)});}));
router.get('/claims/:claimId',read,asyncHandler(async(req,res)=>{const p=parse<{claimId:string}>(claimIdSchema,req.params,res);if(p)res.json({data:await service.getClaim(p.claimId)});}));return router;}
