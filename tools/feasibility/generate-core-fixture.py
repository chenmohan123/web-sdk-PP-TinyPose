# 用固定上游 OpenCV/DARK 路径复现单测夹具，不读取 SDK 实现。
import argparse,ast,json,sys
import numpy as np,cv2
from pathlib import Path
parser=argparse.ArgumentParser(description='从固定 PaddleDetection 源码复现数学夹具')
parser.add_argument('--upstream',required=True,type=Path)
parser.add_argument('--out',type=Path,default=Path('.tmp/pose-reference.json'))
parser.add_argument('--check',type=Path)
args=parser.parse_args()
up=args.upstream/'deploy/python'
sys.path.insert(0,str(up.resolve()))
from keypoint_preprocess import TopDownEvalAffine,expand_crop,get_affine_transform
ns={'np':np,'cv2':cv2,'get_affine_transform':get_affine_transform}
tree=ast.parse((up/'keypoint_postprocess.py').read_text())
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and getattr(n,'name','') in ['HRNetPostProcess','transform_preds','affine_transform']],type_ignores=[]),'official','exec'),ns)
cases=[]
for w,h,box in [(9,11,None),(10,14,None),(27,31,[4.7,5.2,8.9,19.8]),(27,31,[-3,2,13,25]),(33,25,[2,3,28,5]),(31,35,[18,11,2,20])]:
 y,x=np.mgrid[:h,:w]; rgb=np.stack([(x*31+y*7)%256,(x*13+y*19)%256,(x*3+y*47)%256],-1).astype('uint8')
 crop=[0,0,w,h]; im=rgb
 if box:
  a,b,c,d=box; im,coords,_=expand_crop(rgb,np.array([0,1,a,b,a+c,b+d])); crop=[coords[0],coords[1],im.shape[1],im.shape[0]]
 warped,_=TopDownEvalAffine([192,256])(im,{'im_shape':np.array(im.shape[:2],np.float32)})
 norm=((warped.astype(np.float32)/255.-np.array([.485,.456,.406],np.float32))/np.array([.229,.224,.225],np.float32)).transpose(2,0,1).flatten()
 indices=list(range(0,len(norm),997))+[0,191,192,49151,147455]
 cases.append(dict(width=w,height=h,region=box,crop=crop,indices=indices,values=[float(norm[i]) for i in indices]))
hm=np.empty((1,17,64,48),np.float32)
y,x=np.mgrid[:64,:48]
for j in range(17):hm[0,j]=np.exp(-((x-(7.35+j*1.8))**2+(y-(9.7+j*2.3))**2)/6.0)*(j+1)/10
preds,scores=ns['HRNetPostProcess']().get_final_preds(hm.copy(),np.array([[4.,6.]]),np.array([[9.,11.]])/200.)
payload=json.dumps(dict(upstream='PaddleDetection b25522a0f4bde8c80603f3ba5e3472059972e3b5 / OpenCV '+cv2.__version__,preprocess=cases,dark=preds[0].tolist(),scores=scores[0,:,0].tolist()),indent=2)
args.out.parent.mkdir(parents=True,exist_ok=True)
args.out.write_text(payload,encoding='utf-8')
if args.check:
 assert json.loads(args.check.read_text(encoding='utf-8')) == json.loads(payload), '生成结果与归档夹具不一致'
print('官方数学夹具已生成'+('，与归档一致' if args.check else ''))
