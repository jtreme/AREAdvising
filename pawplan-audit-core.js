(function(root){
'use strict';

function normalizeLines(rawText){
return String(rawText||'').split(/\r?\n/).map(function(line){return line.trim();}).filter(Boolean);
}

function parseTerm(line){
var m=String(line||'').match(/(Fall|Spring|Sum1|Sum2|Summer)\s+'?(\d{2,4})/);
if(!m)return '';
var year=parseInt(m[2],10);
if(year<100)year+=2000;
var season=(m[1]==='Sum1'||m[1]==='Sum2')?'Summer':m[1];
return season+' '+year;
}

function parseGrade(line,termMatchText){
var grade='';
if(termMatchText&&line.indexOf(termMatchText)!==-1){
var after=line.substring(line.indexOf(termMatchText)+termMatchText.length);
var gm=after.match(/\s(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F|W|U|S|CR|TA|TB\+|TB-|TB|TC\+|TC-|TC|TD\+|TD-|TD|TR|TIP|MET|PF|WA)(?:\s|$)/);
if(gm)grade=gm[1];
}
if(!grade){
var gm2=line.match(/\s(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F|W|U|S|CR|TA|TB\+|TB-|TB|TC\+|TC-|TC|TD\+|TD-|TD|TR|TIP|MET|PF|WA)\s+\d{1,2}\.\d{3}/);
if(gm2)grade=gm2[1];
}
if(!grade){
var gm3=line.match(/\s(MET|PF|Verify)\s*$/);
if(gm3)grade=gm3[1]==='Verify'?'VERIFY':gm3[1];
}
return grade;
}

function parseUnits(line){
var m=String(line||'').match(/(?:^|\s)(\d{1,2}\.\d{3})(?:\s|$)/);
return m?parseFloat(m[1]):0;
}

function extractCourseCodes(line){
var out=[];
var text=String(line||'');
// Handles normal spacing ("ARE 270") and PDF extraction joins ("EntreprenershipARE 270").
var re=/(^|[^A-Z])([A-Z]{1,4})\s*(\d{3}[A-Z]?|\d[A-Z]{2,5}|\d\*+|\*+)(?=\s|$|,|\.|;|\)|Rqmnt|Move|Waive)/g;
var m;
while((m=re.exec(text))!==null){
var prefix=m[2], num=m[3];
if(['PRK','GPA','Cum','Page','SAO'].indexOf(prefix)!==-1)continue;
out.push(prefix+' '+num);
}
return out;
}

function looksLikeRequirementGroup(line,codes){
var text=String(line||'');
if(/^\d+\s+/.test(text)&&!parseTerm(text)&&!parseGrade(text,''))return true;
if(/\bor\b/i.test(text)&&!parseTerm(text))return true;
if(/Electives?|Humanities|Social Sciences|Statistics|Fitness|Interdisc|Free Electives|ARE 400-level/i.test(text)&&!parseTerm(text))return true;
return codes.length>1&&!parseTerm(text);
}

function getRequirementKind(line,section){
var text=String(line||'');
if(/ARE 400-level/i.test(text))return 'ARE 400-level Electives';
if(/ARE Elective/i.test(text))return 'ARE Elective';
if(/Technical Electives/i.test(text))return 'Technical Electives';
if(/Departmental or Technical/i.test(text))return 'Departmental or Technical Electives';
if(/Humanities Elective/i.test(text))return 'Humanities Elective';
if(/Social Sciences Elective/i.test(text))return 'Social Science Elective';
if(/HES Fitness/i.test(text))return 'HES Fitness';
if(/HES Fit Elective/i.test(text))return 'HES Activity';
if(/Free Electives/i.test(text))return 'Free Electives';
if(/ALS 103|ALS 303|ARE 290/i.test(text))return 'ALS Orientation Choice';
if(/AEE 226|CSC 200/i.test(text))return 'AEE/CSC 200 Choice';
if(/MA 114|MA 231|MA 241/i.test(text))return 'Math Choice';
if(/Statistics/i.test(text))return 'Statistics Choice';
if(/Interdisc Perspectives/i.test(text))return 'Interdisciplinary Perspectives';
if(/GEP Global Knowledge/i.test(text))return 'GEP Global Knowledge';
if(/Found\. of American Democracy/i.test(text))return 'American Democracy';
if(/COM 112|ENG 332/i.test(text))return 'Communications Choice';
if(/ACC 200|ACC 210/i.test(text))return 'Accounting Choice';
if(/ARE 303|ARE 304/i.test(text))return 'ARE 303/304';
if(/ARE 306|ARE 309/i.test(text))return 'ARE 306/309';
if(/ARE 311|ARE 312/i.test(text))return 'ARE 311/312';
if(/ARE 321|ARE 323|BUS 320/i.test(text))return 'ARE 321/323/BUS 320';
if(/ARE 301|EC 301/i.test(text))return 'ARE/EC 301';
return 'Requirement Group';
}

function parseAuditText(rawText){
var lines=normalizeLines(rawText);
var items=[];
var section='';
for(var i=0;i<lines.length;i++){
var line=lines[i];
var sm=line.match(/^(\d+)\s*-\s/);
if(sm){section=sm[1];continue;}
if(line.indexOf('Description Class Term')!==-1||line.indexOf('Degree Audit')!==-1||line.indexOf('https://')!==-1)continue;
var codes=extractCourseCodes(line);
var termMatch=line.match(/(Fall|Spring|Sum1|Sum2|Summer)\s+'?(\d{2,4})/);
var termText=termMatch?termMatch[0]:'';
var term=parseTerm(line);
var grade=parseGrade(line,termText);
var units=parseUnits(line);
var nextLine=lines[i+1]||'';
var flags=[];
if(nextLine.indexOf('Wait Listed')!==-1||line.indexOf('Wait Listed')!==-1)flags.push('Wait Listed');
if(nextLine.indexOf('Course provides excess units')!==-1||line.indexOf('Course provides excess units')!==-1)flags.push('Course provides excess units');
if(line.indexOf('Approved Exception')!==-1||nextLine.indexOf('Approved Exception')!==-1)flags.push('Approved Exception');
if(looksLikeRequirementGroup(line,codes)){
items.push({
type:'requirement_group',
section:section,
raw:line,
codes:codes,
code:codes[0]||'',
term:term,
grade:grade,
units:units,
requirementKind:getRequirementKind(line,section),
classification:'unmet_requirement',
flags:flags
});
continue;
}
if(!codes.length){
if(/Approved Exception|Approved Waiver/.test(line)){
items.push({type:'note',section:section,raw:line,flags:['Approved Exception'],classification:'advisor_review'});
}
continue;
}
codes.forEach(function(code){
items.push({
type:'course',
section:section,
raw:line,
code:code,
codes:[code],
term:term,
grade:grade,
units:units,
flags:flags.slice(),
wildcard:code.indexOf('*')!==-1
});
});
}
return items;
}

function classifyAuditItems(parsedItems){
return (parsedItems||[]).map(function(item){
var out=Object.assign({},item);
var g=out.grade||'';
if(out.type==='note'){
out.classification='advisor_review';
out.statusNote=(out.flags||[]).join('; ');
return out;
}
if(out.section==='99'){
out.classification='non_degree';
out.reviewReason='Audit lists this item in Section 99 - Non-degree Courses.';
return out;
}
if(out.type==='requirement_group'){
out.classification='unmet_requirement';
out.placementStatus='unplaced';
out.confidence='high';
return out;
}
if(g==='MET'||g==='VERIFY'||out.flags.indexOf('Course provides excess units')!==-1||out.wildcard){
out.classification='advisor_review';
out.reviewReason=g==='MET'?'Verification or duplicate row; do not double-count.':
out.wildcard?'Wildcard/generic transfer code needs advisor confirmation.':
'Course provides excess units and should not be double-counted.';
return out;
}
if(g==='TIP'){
out.classification='transfer_in_progress';
out.reviewReason='Transfer-in-progress credit is not posted.';
return out;
}
if(['TA','TB','TB+','TB-','TC','TC+','TC-','TD','TD+','TD-','TR','CR','PF'].indexOf(g)!==-1){
if(g==='PF'&&!out.units){
out.classification='advisor_review';
out.reviewReason='Proficiency/verify row with no credit units.';
} else {
out.classification='transfer_posted';
}
return out;
}
if(/^[ABCD][+-]?$/.test(g)){
out.classification='completed_nc_state';
return out;
}
if(out.term&&!g){
out.classification='planned_current';
if(out.flags.indexOf('Wait Listed')!==-1){
out.advisorReviewFlag=true;
out.statusNote='Wait Listed';
}
return out;
}
out.classification='advisor_review';
out.reviewReason='Could not confidently classify audit row.';
return out;
});
}

function matchItemsToRequirements(classifiedItems, requirementCatalog){
return (classifiedItems||[]).map(function(item){
var out=Object.assign({},item);
var code=out.code||'';
var match=requirementCatalog&&requirementCatalog[code];
if(match)out.matchedRequirement=match;
return out;
});
}

function buildPlanSections(classifiedItems, matchedRequirements, planningSettings){
var sections={
completedNcState:[],
transferPrior:[],
plannedCurrent:[],
futureRequirements:[],
advisorReview:[]
};
(matchedRequirements||classifiedItems||[]).forEach(function(item){
if(item.classification==='completed_nc_state')sections.completedNcState.push(item);
else if(item.classification==='transfer_posted')sections.transferPrior.push(item);
else if(item.classification==='planned_current')sections.plannedCurrent.push(item);
else if(item.classification==='unmet_requirement')sections.futureRequirements.push(item);
else sections.advisorReview.push(item);
});
return sections;
}

function isTopAuditSection(section){
return section&&section.term&&(
section.term.indexOf('Transfer')===0||
section.term.indexOf('Prior NC')===0||
section.term.indexOf('Completed NC State')===0||
section.term.indexOf('Planned / Current')===0||
section.term.indexOf('In Progress')===0
);
}

function isSchedulableSemester(section){
return section&&section.term&&!isTopAuditSection(section)&&
section.term.indexOf('Advisor Review')===-1&&
section.term.indexOf('Non-Degree')===-1&&
section.term.indexOf('Not Applied')===-1;
}

var api={
parseAuditText:parseAuditText,
classifyAuditItems:classifyAuditItems,
matchItemsToRequirements:matchItemsToRequirements,
buildPlanSections:buildPlanSections,
isTopAuditSection:isTopAuditSection,
isSchedulableSemester:isSchedulableSemester
};
root.PawPlanAuditCore=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
