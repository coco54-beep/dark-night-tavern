"use strict";
import * as T from "../vendor/transformers.min.js";
T.env.allowLocalModels = true;
T.env.allowRemoteModels = false;
T.env.useBrowserCache = true;
T.env.localModelPath = "../models/";
T.env.backends.onnx.wasm.wasmPaths = "../vendor/";
T.env.backends.onnx.wasm.numThreads = 1;
let extractorPromise = null;
function getExtractor(){
  if(!extractorPromise){
    extractorPromise = T.pipeline("feature-extraction","bge-small-zh-v1.5",{quantized:true});
  }
  return extractorPromise;
}
self.onmessage = async (event)=>{
  const {id,type,texts} = event.data || {};
  try{
    if(type==="warm"){
      await getExtractor();
      self.postMessage({id,ok:true});
      return;
    }
    if(type==="embed"){
      const extractor = await getExtractor();
      const list = Array.isArray(texts) ? texts : [String(texts||"")];
      const out = await extractor(list,{pooling:"mean",normalize:true});
      const dim = out.dims[out.dims.length-1];
      const vectors = [];
      for(let i=0;i<list.length;i++) vectors.push(Array.from(out.data.slice(i*dim,(i+1)*dim)));
      self.postMessage({id,ok:true,vectors,dim});
      return;
    }
    self.postMessage({id,ok:false,error:"未知请求"});
  }catch(e){
    self.postMessage({id,ok:false,error:(e&&e.message)||String(e)});
  }
};
