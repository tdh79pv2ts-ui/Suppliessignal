import { Router, type NextFunction, type Request, type Response, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { articleEvaluationSchema, claimEvaluationSchema, createPocDatasetSchema, pocDatasetArticlesSchema, pocDatasetIdSchema } from '@suppliesignal/shared';
import { requireAuth, requireRole, type ResolveUser } from '../auth.js';
import { pocEvaluationService, type PocEvaluationService } from '../services/poc-evaluation.js';

const asyncHandler=(fn:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>void fn(req,res).catch(next);
const parse=<T>(schema:z.ZodType<T>,value:unknown,res:Response):T|null=>{const parsed=schema.safeParse(value);if(!parsed.success){res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Request validation failed',details:parsed.error.flatten()}});return null;}return parsed.data;};
const claimParams=pocDatasetIdSchema.extend({claimId:z.string().uuid()});
const articleParams=pocDatasetIdSchema.extend({datasetArticleId:z.string().uuid()});

export function createPocEvaluationRouter(resolveUser:ResolveUser,service:PocEvaluationService=pocEvaluationService):ExpressRouter{
  const router=Router();router.use(requireAuth(resolveUser));router.use('/poc/extraction',requireRole('ADMIN','REVIEWER'));
  router.get('/poc/extraction/datasets',asyncHandler(async(_req,res)=>{res.json({data:await service.list()});}));
  router.post('/poc/extraction/datasets',requireRole('ADMIN'),asyncHandler(async(req,res)=>{const body=parse(createPocDatasetSchema,req.body,res);if(body)res.status(201).json({data:await service.create(body)});}));
  router.get('/poc/extraction/datasets/:datasetId',asyncHandler(async(req,res)=>{const params=parse(pocDatasetIdSchema,req.params,res);if(params)res.json({data:await service.get(params.datasetId)});}));
  router.post('/poc/extraction/datasets/:datasetId/articles',requireRole('ADMIN'),asyncHandler(async(req,res)=>{const params=parse(pocDatasetIdSchema,req.params,res);const body=parse(pocDatasetArticlesSchema,req.body,res);if(params&&body)res.json({data:await service.addArticles(params.datasetId,body.articleIds)});}));
  router.delete('/poc/extraction/datasets/:datasetId/articles',requireRole('ADMIN'),asyncHandler(async(req,res)=>{const params=parse(pocDatasetIdSchema,req.params,res);const body=parse(pocDatasetArticlesSchema,req.body,res);if(params&&body)res.json({data:await service.removeArticles(params.datasetId,body.articleIds)});}));
  router.get('/poc/extraction/datasets/:datasetId/preflight',requireRole('ADMIN'),asyncHandler(async(req,res)=>{const params=parse(pocDatasetIdSchema,req.params,res);if(params)res.json({data:await service.preflight(params.datasetId)});}));
  router.post('/poc/extraction/datasets/:datasetId/run',requireRole('ADMIN'),asyncHandler(async(req,res)=>{const params=parse(pocDatasetIdSchema,req.params,res);if(params)res.status(202).json({data:await service.run(params.datasetId)});}));
  router.get('/poc/extraction/datasets/:datasetId/progress',asyncHandler(async(req,res)=>{const params=parse(pocDatasetIdSchema,req.params,res);if(params){const data=await service.get(params.datasetId);res.json({data:{status:data.status,articles:data.articles.map(a=>({id:a.id,status:a.status,errorCode:a.errorCode,extractionRunId:a.extractionRunId}))}});}}));
  router.put('/poc/extraction/datasets/:datasetId/claims/:claimId/evaluation',asyncHandler(async(req,res)=>{const params=parse(claimParams,req.params,res);const body=parse(claimEvaluationSchema,req.body,res);if(params&&body&&req.authUser)res.json({data:await service.reviewClaim(params.datasetId,params.claimId,req.authUser.id,body)});}));
  router.put('/poc/extraction/datasets/:datasetId/articles/:datasetArticleId/evaluation',asyncHandler(async(req,res)=>{const params=parse(articleParams,req.params,res);const body=parse(articleEvaluationSchema,req.body,res);if(params&&body&&req.authUser)res.json({data:await service.reviewArticle(params.datasetId,params.datasetArticleId,req.authUser.id,body)});}));
  router.get('/poc/extraction/datasets/:datasetId/results',asyncHandler(async(req,res)=>{const params=parse(pocDatasetIdSchema,req.params,res);if(params)res.json({data:await service.results(params.datasetId)});}));
  router.post('/poc/extraction/datasets/:datasetId/complete',requireRole('ADMIN'),asyncHandler(async(req,res)=>{const params=parse(pocDatasetIdSchema,req.params,res);if(params)res.json({data:await service.complete(params.datasetId)});}));
  router.get('/poc/extraction/datasets/:datasetId/export.json',asyncHandler(async(req,res)=>{const params=parse(pocDatasetIdSchema,req.params,res);if(params){res.attachment(`poc-${params.datasetId}.json`).json(await service.exportJson(params.datasetId));}}));
  router.get('/poc/extraction/datasets/:datasetId/export.csv',asyncHandler(async(req,res)=>{const params=parse(pocDatasetIdSchema,req.params,res);if(params){res.attachment(`poc-${params.datasetId}.csv`).type('text/csv').send(await service.exportCsv(params.datasetId));}}));
  return router;
}
